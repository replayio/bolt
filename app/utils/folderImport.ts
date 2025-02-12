import type { Message } from 'ai';
import { generateId, shouldIncludeFile } from './fileUtils';
import { detectProjectCommands, createCommandsMessage } from './projectCommands';

export interface FileArtifact {
  content: string;
  path: string;
}

export async function getFileArtifacts(files: File[]): Promise<FileArtifact[]> {
  return Promise.all(
    files.map(async (file) => {
      return new Promise<FileArtifact>((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          const content = reader.result as string;
          const relativePath = file.webkitRelativePath.split('/').slice(1).join('/');
          resolve({
            content,
            path: relativePath,
          });
        };
        reader.onerror = reject;
        reader.readAsText(file);
      });
    }),
  );
}

export const createChatFromFolder = async (
  fileArtifacts: FileArtifact[],
  binaryFiles: string[],
  folderName: string,
): Promise<Message[]> => {
  const commands = await detectProjectCommands(fileArtifacts);
  const commandsMessage = createCommandsMessage(commands);

  const binaryFilesMessage =
    binaryFiles.length > 0
      ? `\n\nSkipped ${binaryFiles.length} binary files:\n${binaryFiles.map((f) => `- ${f}`).join('\n')}`
      : '';

  let filesContent = `I've imported the contents of the "${folderName}" folder.${binaryFilesMessage}`;
  filesContent += `<boltArtifact id="imported-files" title="Imported Files">`;
  for (const file of fileArtifacts) {
    if (shouldIncludeFile(file.path)) {
      filesContent += `<boltAction type="file" filePath="${file.path}">${file.content}</boltAction>\n\n`;
    }
  }
  filesContent += `</boltArtifact>`;

  const filesMessage: Message = {
    role: 'assistant',
    content: filesContent,
    id: generateId(),
    createdAt: new Date(),
  };

  const userMessage: Message = {
    role: 'user',
    id: generateId(),
    content: `Import the "${folderName}" folder`,
    createdAt: new Date(),
  };

  const messages = [userMessage, filesMessage];

  if (commandsMessage) {
    messages.push({
      role: 'user',
      id: generateId(),
      content: 'Setup the codebase and Start the application',
    });
    messages.push(commandsMessage);
  }

  return messages;
};
