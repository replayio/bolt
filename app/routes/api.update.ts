import { json } from '@remix-run/node';
import type { ActionFunction } from '@remix-run/node';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface UpdateRequestBody {
  branch: string;
  autoUpdate?: boolean;
}

interface UpdateProgress {
  stage: 'fetch' | 'pull' | 'install' | 'build' | 'complete';
  message: string;
  progress?: number;
  error?: string;
  details?: {
    changedFiles?: string[];
    additions?: number;
    deletions?: number;
    commitMessages?: string[];
    totalSize?: string;
    currentCommit?: string;
    remoteCommit?: string;
    updateReady?: boolean;
    changelog?: string;
    compareUrl?: string;
  };
}

export const action: ActionFunction = async ({ request }) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await request.json();

    if (!body || typeof body !== 'object' || !('branch' in body) || typeof body.branch !== 'string') {
      return json({ error: 'Invalid request body: branch is required and must be a string' }, { status: 400 });
    }

    const { branch, autoUpdate = false } = body as UpdateRequestBody;

    // Create a ReadableStream to send progress updates
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const sendProgress = (update: UpdateProgress) => {
          controller.enqueue(encoder.encode(JSON.stringify(update) + '\n'));
        };

        try {
          // Initial check stage
          sendProgress({
            stage: 'fetch',
            message: 'Checking repository status...',
            progress: 0,
          });

          // Check if remote exists
          let defaultBranch = branch || 'main'; // Make branch mutable

          try {
            await execAsync('git remote get-url upstream');
            sendProgress({
              stage: 'fetch',
              message: 'Repository remote verified',
              progress: 10,
            });
          } catch {
            throw new Error(
              'No upstream repository found. Please set up the upstream repository first by running:\ngit remote add upstream https://github.com/stackblitz-labs/bolt.diy.git',
            );
          }

          // Get default branch if not specified
          if (!branch) {
            sendProgress({
              stage: 'fetch',
              message: 'Detecting default branch...',
              progress: 20,
            });

            try {
              const { stdout } = await execAsync('git remote show upstream | grep "HEAD branch" | cut -d" " -f5');
              defaultBranch = stdout.trim() || 'main';
              sendProgress({
                stage: 'fetch',
                message: `Using branch: ${defaultBranch}`,
                progress: 30,
              });
            } catch {
              defaultBranch = 'main'; // Fallback to main if we can't detect
              sendProgress({
                stage: 'fetch',
                message: 'Using default branch: main',
                progress: 30,
              });
            }
          }

          // Fetch stage
          sendProgress({
            stage: 'fetch',
            message: 'Fetching latest changes...',
            progress: 40,
          });

          // Fetch all remotes
          await execAsync('git fetch --all');
          sendProgress({
            stage: 'fetch',
            message: 'Remote changes fetched',
            progress: 50,
          });

          // Check if remote branch exists
          try {
            await execAsync(`git rev-parse --verify upstream/${defaultBranch}`);
            sendProgress({
              stage: 'fetch',
              message: 'Remote branch verified',
              progress: 60,
            });
          } catch {
            throw new Error(
              `Remote branch 'upstream/${defaultBranch}' not found. Please ensure the upstream repository is properly configured.`,
            );
          }

          // Get current commit hash and remote commit hash
          sendProgress({
            stage: 'fetch',
            message: 'Comparing versions...',
            progress: 70,
          });

          const { stdout: currentCommit } = await execAsync('git rev-parse HEAD');
          const { stdout: remoteCommit } = await execAsync(`git rev-parse upstream/${defaultBranch}`);

          // If we're on the same commit, no update is available
          if (currentCommit.trim() === remoteCommit.trim()) {
            sendProgress({
              stage: 'complete',
              message: 'No updates available. You are on the latest version.',
              progress: 100,
              details: {
                currentCommit: currentCommit.trim().substring(0, 7),
                remoteCommit: remoteCommit.trim().substring(0, 7),
              },
            });
            return;
          }

          sendProgress({
            stage: 'fetch',
            message: 'Analyzing changes...',
            progress: 80,
          });

          // Initialize variables
          let changedFiles: string[] = [];
          let commitMessages: string[] = [];
          let stats: RegExpMatchArray | null = null;
          let totalSizeInBytes = 0;

          // Format size for display
          const formatSize = (bytes: number) => {
            if (bytes === 0) {
              return '0 B';
            }

            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));

            return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
          };

          // Get list of changed files and their sizes
          try {
            const { stdout: diffOutput } = await execAsync(
              `git diff --name-status ${currentCommit.trim()}..${remoteCommit.trim()}`,
            );
            const files = diffOutput.split('\n').filter(Boolean);

            if (files.length === 0) {
              sendProgress({
                stage: 'complete',
                message: `No file changes detected between your version and upstream/${defaultBranch}. You might be on a different branch.`,
                progress: 100,
                details: {
                  currentCommit: currentCommit.trim().substring(0, 7),
                  remoteCommit: remoteCommit.trim().substring(0, 7),
                },
              });
              return;
            }

            sendProgress({
              stage: 'fetch',
              message: `Found ${files.length} changed files, calculating sizes...`,
              progress: 90,
            });

            // Get size information for each changed file
            for (const line of files) {
              const [status, file] = line.split('\t');

              if (status !== 'D') {
                // Skip deleted files
                try {
                  const { stdout: sizeOutput } = await execAsync(`git cat-file -s ${remoteCommit.trim()}:${file}`);
                  const size = parseInt(sizeOutput) || 0;
                  totalSizeInBytes += size;
                } catch {
                  console.debug(`Could not get size for file: ${file}`);
                }
              }
            }

            changedFiles = files.map((line) => {
              const [status, file] = line.split('\t');
              return `${status === 'M' ? 'Modified' : status === 'A' ? 'Added' : 'Deleted'}: ${file}`;
            });
          } catch (err) {
            console.debug('Failed to get changed files:', err);
            throw new Error(`Failed to compare changes with upstream/${defaultBranch}. Are you on the correct branch?`);
          }

          // Get commit messages between current and remote
          try {
            const { stdout: logOutput } = await execAsync(
              `git log --pretty=format:"%h|%s|%aI" ${currentCommit.trim()}..${remoteCommit.trim()}`,
            );

            // Parse and group commits by type
            const commits = logOutput
              .split('\n')
              .filter(Boolean)
              .map((line) => {
                const [hash, subject, timestamp] = line.split('|');
                let type = 'other';
                let message = subject;

                if (subject.startsWith('feat:') || subject.startsWith('feature:')) {
                  type = 'feature';
                  message = subject.replace(/^feat(?:ure)?:/, '').trim();
                } else if (subject.startsWith('fix:')) {
                  type = 'fix';
                  message = subject.replace(/^fix:/, '').trim();
                } else if (subject.startsWith('docs:')) {
                  type = 'docs';
                  message = subject.replace(/^docs:/, '').trim();
                } else if (subject.startsWith('style:')) {
                  type = 'style';
                  message = subject.replace(/^style:/, '').trim();
                } else if (subject.startsWith('refactor:')) {
                  type = 'refactor';
                  message = subject.replace(/^refactor:/, '').trim();
                } else if (subject.startsWith('perf:')) {
                  type = 'perf';
                  message = subject.replace(/^perf:/, '').trim();
                } else if (subject.startsWith('test:')) {
                  type = 'test';
                  message = subject.replace(/^test:/, '').trim();
                } else if (subject.startsWith('build:')) {
                  type = 'build';
                  message = subject.replace(/^build:/, '').trim();
                } else if (subject.startsWith('ci:')) {
                  type = 'ci';
                  message = subject.replace(/^ci:/, '').trim();
                }

                return {
                  hash,
                  type,
                  message,
                  timestamp: new Date(timestamp),
                };
              });

            // Group commits by type
            const groupedCommits = commits.reduce(
              (acc, commit) => {
                if (!acc[commit.type]) {
                  acc[commit.type] = [];
                }

                acc[commit.type].push(commit);

                return acc;
              },
              {} as Record<string, typeof commits>,
            );

            // Format commit messages with emojis and timestamps
            const formattedMessages = Object.entries(groupedCommits).map(([type, commits]) => {
              const emoji = {
                feature: '✨',
                fix: '🐛',
                docs: '📚',
                style: '💎',
                refactor: '♻️',
                perf: '⚡',
                test: '🧪',
                build: '🛠️',
                ci: '⚙️',
                other: '🔍',
              }[type];

              const title = {
                feature: 'Features',
                fix: 'Bug Fixes',
                docs: 'Documentation',
                style: 'Styles',
                refactor: 'Code Refactoring',
                perf: 'Performance',
                test: 'Tests',
                build: 'Build',
                ci: 'CI',
                other: 'Other Changes',
              }[type];

              return `### ${emoji} ${title}\n\n${commits
                .map((c) => `* ${c.message} (${c.hash.substring(0, 7)}) - ${c.timestamp.toLocaleString()}`)
                .join('\n')}`;
            });

            commitMessages = formattedMessages;
          } catch {
            // Handle silently - empty commitMessages array will be used
          }

          // Get diff stats using the specific commits
          try {
            const { stdout: diffStats } = await execAsync(
              `git diff --shortstat ${currentCommit.trim()}..${remoteCommit.trim()}`,
            );
            stats = diffStats.match(
              /(\d+) files? changed(?:, (\d+) insertions?\\(\\+\\))?(?:, (\d+) deletions?\\(-\\))?/,
            );
          } catch {
            // Handle silently - null stats will be used
          }

          // If we somehow still have no changes detected
          if (!stats && changedFiles.length === 0) {
            sendProgress({
              stage: 'complete',
              message: `No changes detected between your version and upstream/${defaultBranch}. This might be unexpected - please check your git status.`,
              progress: 100,
            });
            return;
          }

          // Fetch changelog
          sendProgress({
            stage: 'fetch',
            message: 'Fetching changelog...',
            progress: 95,
          });

          const changelog = await fetchChangelog(currentCommit.trim(), remoteCommit.trim());

          // We have changes, send the details
          sendProgress({
            stage: 'fetch',
            message: `Changes detected on upstream/${defaultBranch}`,
            progress: 100,
            details: {
              changedFiles,
              additions: stats?.[2] ? parseInt(stats[2]) : 0,
              deletions: stats?.[3] ? parseInt(stats[3]) : 0,
              commitMessages,
              totalSize: formatSize(totalSizeInBytes),
              currentCommit: currentCommit.trim().substring(0, 7),
              remoteCommit: remoteCommit.trim().substring(0, 7),
              updateReady: true,
              changelog,
              compareUrl: `https://github.com/stackblitz-labs/bolt.diy/compare/${currentCommit.trim().substring(0, 7)}...${remoteCommit.trim().substring(0, 7)}`,
            },
          });

          // Only proceed with update if autoUpdate is true
          if (!autoUpdate) {
            sendProgress({
              stage: 'complete',
              message: 'Update is ready to be applied. Click "Update Now" to proceed.',
              progress: 100,
              details: {
                changedFiles,
                additions: stats?.[2] ? parseInt(stats[2]) : 0,
                deletions: stats?.[3] ? parseInt(stats[3]) : 0,
                commitMessages,
                totalSize: formatSize(totalSizeInBytes),
                currentCommit: currentCommit.trim().substring(0, 7),
                remoteCommit: remoteCommit.trim().substring(0, 7),
                updateReady: true,
                changelog,
                compareUrl: `https://github.com/stackblitz-labs/bolt.diy/compare/${currentCommit.trim().substring(0, 7)}...${remoteCommit.trim().substring(0, 7)}`,
              },
            });
            return;
          }

          // Pull stage
          sendProgress({
            stage: 'pull',
            message: `Pulling changes from upstream/${defaultBranch}...`,
            progress: 0,
          });

          await execAsync(`git pull upstream ${defaultBranch}`);

          sendProgress({
            stage: 'pull',
            message: 'Changes pulled successfully',
            progress: 100,
          });

          // Install stage
          sendProgress({
            stage: 'install',
            message: 'Installing dependencies...',
            progress: 0,
          });

          await execAsync('pnpm install');

          sendProgress({
            stage: 'install',
            message: 'Dependencies installed successfully',
            progress: 100,
          });

          // Build stage
          sendProgress({
            stage: 'build',
            message: 'Building application...',
            progress: 0,
          });

          await execAsync('pnpm build');

          sendProgress({
            stage: 'build',
            message: 'Build completed successfully',
            progress: 100,
          });

          // Complete
          sendProgress({
            stage: 'complete',
            message: 'Update completed successfully! Click Restart to apply changes.',
            progress: 100,
          });
        } catch (err) {
          sendProgress({
            stage: 'complete',
            message: 'Update failed',
            error: err instanceof Error ? err.message : 'Unknown error occurred',
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('Update preparation failed:', err);
    return json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error occurred while preparing update',
      },
      { status: 500 },
    );
  }
};

// Add this function to fetch the changelog
async function fetchChangelog(currentCommit: string, remoteCommit: string): Promise<string> {
  try {
    // First try to get the changelog.md content
    const { stdout: changelogContent } = await execAsync('git show upstream/main:changelog.md');

    // If we have a changelog, return it
    if (changelogContent) {
      return changelogContent;
    }

    // If no changelog.md, generate one in a similar format
    let changelog = '# Changes in this Update\n\n';

    // Get commit messages grouped by type
    const { stdout: commitLog } = await execAsync(
      `git log --pretty=format:"%h|%s|%b" ${currentCommit.trim()}..${remoteCommit.trim()}`,
    );

    const commits = commitLog.split('\n').filter(Boolean);
    const categorizedCommits: Record<string, string[]> = {
      '✨ Features': [],
      '🐛 Bug Fixes': [],
      '📚 Documentation': [],
      '💎 Styles': [],
      '♻️ Code Refactoring': [],
      '⚡ Performance': [],
      '🧪 Tests': [],
      '🛠️ Build': [],
      '⚙️ CI': [],
      '🔍 Other Changes': [],
    };

    // Categorize commits
    for (const commit of commits) {
      const [hash, subject] = commit.split('|');
      let category = '🔍 Other Changes';

      if (subject.startsWith('feat:') || subject.startsWith('feature:')) {
        category = '✨ Features';
      } else if (subject.startsWith('fix:')) {
        category = '🐛 Bug Fixes';
      } else if (subject.startsWith('docs:')) {
        category = '📚 Documentation';
      } else if (subject.startsWith('style:')) {
        category = '💎 Styles';
      } else if (subject.startsWith('refactor:')) {
        category = '♻️ Code Refactoring';
      } else if (subject.startsWith('perf:')) {
        category = '⚡ Performance';
      } else if (subject.startsWith('test:')) {
        category = '🧪 Tests';
      } else if (subject.startsWith('build:')) {
        category = '🛠️ Build';
      } else if (subject.startsWith('ci:')) {
        category = '⚙️ CI';
      }

      const message = subject.includes(':') ? subject.split(':')[1].trim() : subject.trim();
      categorizedCommits[category].push(`* ${message} (${hash.substring(0, 7)})`);
    }

    // Build changelog content
    for (const [category, commits] of Object.entries(categorizedCommits)) {
      if (commits.length > 0) {
        changelog += `\n## ${category}\n\n${commits.join('\n')}\n`;
      }
    }

    // Add stats
    const { stdout: stats } = await execAsync(`git diff --shortstat ${currentCommit.trim()}..${remoteCommit.trim()}`);

    if (stats) {
      changelog += '\n## 📊 Stats\n\n';
      changelog += `${stats.trim()}\n`;
    }

    return changelog;
  } catch (error) {
    console.error('Error fetching changelog:', error);
    return 'Unable to fetch changelog';
  }
}
