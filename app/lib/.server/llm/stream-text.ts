import { convertToCoreMessages, streamText as _streamText } from 'ai';
import { MAX_TOKENS } from './constants';
import { getSystemPrompt } from '~/lib/common/prompts/prompts';
import {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  getModelList,
  MODEL_REGEX,
  MODIFICATIONS_TAG_NAME,
  PROVIDER_LIST,
  PROVIDER_REGEX,
  WORK_DIR,
} from '~/utils/constants';
import ignore from 'ignore';
import type { IProviderSetting } from '~/types/model';
import { PromptLibrary } from '~/lib/common/prompt-library';
import { allowedHTMLElements } from '~/utils/markdown';

interface ToolResult<Name extends string, Args, Result> {
  toolCallId: string;
  toolName: Name;
  args: Args;
  result: Result;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolInvocations?: ToolResult<string, unknown, unknown>[];
  model?: string;
}

export type Messages = Message[];

export type StreamingOptions = Omit<Parameters<typeof _streamText>[0], 'model'>;

export interface File {
  type: 'file';
  content: string;
  isBinary: boolean;
}

export interface Folder {
  type: 'folder';
}

type Dirent = File | Folder;

export type FileMap = Record<string, Dirent | undefined>;

export function simplifyBoltActions(input: string): string {
  // Using regex to match boltAction tags that have type="file"
  const regex = /(<boltAction[^>]*type="file"[^>]*>)([\s\S]*?)(<\/boltAction>)/g;

  // Replace each matching occurrence
  return input.replace(regex, (_0, openingTag, _2, closingTag) => {
    return `${openingTag}\n          ...\n        ${closingTag}`;
  });
}

// Common patterns to ignore, similar to .gitignore
const IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  '.next/**',
  'coverage/**',
  '.cache/**',
  '.vscode/**',
  '.idea/**',
  '**/*.log',
  '**/.DS_Store',
  '**/npm-debug.log*',
  '**/yarn-debug.log*',
  '**/yarn-error.log*',
  '**/*lock.json',
  '**/*lock.yml',
];
const ig = ignore().add(IGNORE_PATTERNS);

function createFilesContext(files: FileMap) {
  let filePaths = Object.keys(files);
  filePaths = filePaths.filter((x) => {
    const relPath = x.replace('/home/project/', '');
    return !ig.ignores(relPath);
  });

  const fileContexts = filePaths
    .filter((x) => files[x] && files[x].type == 'file')
    .map((path) => {
      const dirent = files[path];

      if (!dirent || dirent.type == 'folder') {
        return '';
      }

      const codeWithLinesNumbers = dirent.content
        .split('\n')
        .map((v, i) => `${i + 1}|${v}`)
        .join('\n');

      return `<file path="${path}">\n${codeWithLinesNumbers}\n</file>`;
    });

  return `Below are the code files present in the webcontainer:\ncode format:\n<line number>|<line content>\n <codebase>${fileContexts.join('\n\n')}\n\n</codebase>`;
}

function extractPropertiesFromMessage(message: Message): { model: string; provider: string; content: string } {
  const textContent = Array.isArray(message.content)
    ? message.content.find((item) => item.type === 'text')?.text || ''
    : message.content;

  const modelMatch = textContent.match(MODEL_REGEX);
  const providerMatch = textContent.match(PROVIDER_REGEX);

  /*
   * Extract model
   * const modelMatch = message.content.match(MODEL_REGEX);
   */
  const model = modelMatch ? modelMatch[1] : DEFAULT_MODEL;

  /*
   * Extract provider
   * const providerMatch = message.content.match(PROVIDER_REGEX);
   */
  const provider = providerMatch ? providerMatch[1] : DEFAULT_PROVIDER.name;

  const cleanedContent = Array.isArray(message.content)
    ? message.content.map((item) => {
        if (item.type === 'text') {
          return {
            type: 'text',
            text: item.text?.replace(MODEL_REGEX, '').replace(PROVIDER_REGEX, ''),
          };
        }

        return item; // Preserve image_url and other types as is
      })
    : textContent.replace(MODEL_REGEX, '').replace(PROVIDER_REGEX, '');

  return { model, provider, content: cleanedContent };
}

export async function getStreamTextArguments(props: {
  messages: Messages;
  env: Env;
  apiKeys?: Record<string, string>;
  files?: FileMap;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
}) {
  const { messages, env: serverEnv, apiKeys, files, providerSettings, promptId } = props;

  // console.log({serverEnv});

  let currentModel = DEFAULT_MODEL;
  let currentProvider = DEFAULT_PROVIDER.name;
  const MODEL_LIST = await getModelList({ apiKeys, providerSettings, serverEnv: serverEnv as any });
  const processedMessages = messages.map((message) => {
    if (message.role === 'user') {
      const { model, provider, content } = extractPropertiesFromMessage(message);

      if (MODEL_LIST.find((m) => m.name === model)) {
        currentModel = model;
      }

      currentProvider = provider;

      return { ...message, content };
    } else if (message.role == 'assistant') {
      const content = message.content;

      // content = simplifyBoltActions(content);

      return { ...message, content };
    }

    return message;
  });

  const modelDetails = MODEL_LIST.find((m) => m.name === currentModel);

  const dynamicMaxTokens = modelDetails && modelDetails.maxTokenAllowed ? modelDetails.maxTokenAllowed : MAX_TOKENS;

  let systemPrompt =
    PromptLibrary.getPropmtFromLibrary(promptId || 'default', {
      cwd: WORK_DIR,
      allowedHtmlElements: allowedHTMLElements,
      modificationTagName: MODIFICATIONS_TAG_NAME,
    }) ?? getSystemPrompt();
  let codeContext = '';

  if (files) {
    codeContext = createFilesContext(files);
    codeContext = '';
    systemPrompt = `${systemPrompt}\n\n ${codeContext}`;
  }

  const coreMessages = convertToCoreMessages(processedMessages as any);

  return {
    currentModel,
    currentProvider,
    system: systemPrompt,
    maxTokens: dynamicMaxTokens,
    messages: coreMessages,
  };
}

export async function streamText(props: {
  messages: Messages;
  env: Env;
  options?: StreamingOptions;
  apiKeys?: Record<string, string>;
  files?: FileMap;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
}) {
  const args = await getStreamTextArguments(props);
  const { currentModel, currentProvider } = args;

  const provider = PROVIDER_LIST.find((p) => p.name === currentProvider) || DEFAULT_PROVIDER;

  const model = provider.getModelInstance({
    model: currentModel,
    serverEnv: props.env,
    apiKeys: props.apiKeys,
    providerSettings: props.providerSettings,
  });

  return _streamText({ ...args, ...props.options, model });
}
