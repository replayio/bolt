// Core logic for using simulation data from remote recording to enhance
// the AI developer prompt.

// Currently the simulation prompt is sent from the server.

import { type SimulationData, type MouseData } from './Recording';
import { assert, ProtocolClient, sendCommandDedicatedClient } from './ReplayProtocolClient';
import JSZip from 'jszip';

// Data supplied by the client for a simulation prompt, separate from the chat input.
export interface SimulationPromptClientData {
  simulationData: SimulationData;
  repositoryContents: string; // base64 encoded zip file
  mouseData?: MouseData;
}

interface RerecordGenerateParams {
  rerecordData: SimulationData;
  repositoryContents: string;
}

export async function getSimulationRecording(
  simulationData: SimulationData,
  repositoryContents: string
): Promise<string> {
  const params: RerecordGenerateParams = {
    rerecordData: simulationData,
    repositoryContents,
  };
  const rv = await sendCommandDedicatedClient({
    method: "Recording.globalExperimentalCommand",
    params: {
      name: "rerecordGenerate",
      params,
    },
  });

  return (rv as { rval: { rerecordedRecordingId: string } }).rval.rerecordedRecordingId;
}

type ProtocolExecutionPoint = string;

export interface URLLocation {
  sourceId: string;
  line: number;
  column: number;
  url: string;
}

// A location within a recording and associated source contents.
export interface URLLocationWithSource extends URLLocation {
  // Text from the application source indicating the location.
  source: string;
}

interface ExecutionDataEntry {
  // Value from the application source which is being described.
  value?: string;

  // Description of the contents of the value. If |value| is omitted
  // this describes a control dependency for the location.
  contents: string;

  // Any associated execution point.
  associatedPoint?: ProtocolExecutionPoint;

  // Location in the recording of the associated execution point.
  associatedLocation?: URLLocationWithSource;

  // Any expression for the value at the associated point which flows to this one.
  associatedValue?: string;

  // Description of how data flows from the associated point to this one.
  associatedDataflow?: string;
}

interface ExecutionDataPoint {
  // Associated point.
  point: ProtocolExecutionPoint;

  // Location in the recording being described.
  location: URLLocationWithSource;

  // Entries describing the point.
  entries: ExecutionDataEntry[];
}

// Initial point for analysis that is an uncaught exception thrown
// from application code called by React, causing the app to unmount.
interface ExecutionDataInitialPointReactException {
  kind: "ReactException";
  errorText: string;

  // Whether the exception was thrown by library code called at the point.
  calleeFrame: boolean;
}

// Initial point for analysis that is an exception logged to the console.
interface ExecutionDataInitialPointConsoleError {
  kind: "ConsoleError";
  errorText: string;
}

type BaseExecutionDataInitialPoint =
  | ExecutionDataInitialPointReactException
  | ExecutionDataInitialPointConsoleError;

export type ExecutionDataInitialPoint = {
  point: ProtocolExecutionPoint;
} & BaseExecutionDataInitialPoint;

export interface ExecutionDataAnalysisResult {
  // Points which were described.
  points: ExecutionDataPoint[];

  // If an expression was specified, the dataflow steps for that expression.
  dataflow?: string[];

  // The initial point which was analyzed. If no point was originally specified,
  // another point will be picked based on any comments or other data in the recording.
  point?: ProtocolExecutionPoint;

  // Any comment text associated with the point.
  commentText?: string;

  // If the comment is on a React component, the name of the component.
  reactComponentName?: string;

  // If no point or comment was available, describes the failure associated with the
  // initial point of the analysis.
  failureData?: ExecutionDataInitialPoint;
}

function trimFileName(url: string): string {
  const lastSlash = url.lastIndexOf('/');
  return url.slice(lastSlash + 1);
}

async function getSourceText(repositoryContents: string, fileName: string): Promise<string> {
  const zip = new JSZip();
  const binaryData = Buffer.from(repositoryContents, 'base64');
  await zip.loadAsync(binaryData as any /* TS complains but JSZip works */);
  for (const [path, file] of Object.entries(zip.files)) {
    if (trimFileName(path) === fileName) {
      return await file.async('string');
    }
  }
  for (const path of Object.keys(zip.files)) {
    console.log("RepositoryPath", path);
  }
  throw new Error(`File ${fileName} not found in repository`);
}

async function annotateSource(repositoryContents: string, fileName: string, source: string, annotation: string): Promise<string> {
  const sourceText = await getSourceText(repositoryContents, fileName);
  const sourceLines = sourceText.split('\n');
  const lineIndex = sourceLines.findIndex(line => line.includes(source));
  if (lineIndex === -1) {
    throw new Error(`Source text ${source} not found in ${fileName}`);
  }

  let rv = "";
  for (let i = lineIndex - 3; i < lineIndex + 3; i++) {
    if (i < 0 || i >= sourceLines.length) {
      continue;
    }
    if (i === lineIndex) {
      const leadingSpaces = sourceLines[i].match(/^\s*/)![0];
      rv += `${leadingSpaces}// ${annotation}\n`;
    }
    rv += `${sourceLines[i]}\n`;
  }
  return rv;
}

async function enhancePromptFromFailureData(
  failurePoint: ExecutionDataPoint,
  failureData: ExecutionDataInitialPoint,
  repositoryContents: string
): Promise<string> {
  const pointText = failurePoint.location.source.trim();
  const fileName = trimFileName(failurePoint.location.url);

  let prompt = "";
  let annotation;

  switch (failureData.kind) {
    case "ReactException":
      prompt += "An exception was thrown which causes React to unmount the application.\n";
      if (failureData.calleeFrame) {
        annotation = `A function called from here is throwing the exception "${failureData.errorText}"`;
      } else {
        annotation = `This line is throwing the exception "${failureData.errorText}"`;
      }
      break;
    case "ConsoleError":
      prompt += "An exception was thrown and later logged to the console.\n";
      annotation = `This line is throwing the exception "${failureData.errorText}"`;
      break;
    default:
      throw new Error(`Unknown failure kind: ${(failureData as any).kind}`);
  }

  const annotatedSource = await annotateSource(repositoryContents, fileName, pointText, annotation);

  prompt += `Here is the affected code, in ${fileName}:\n\n`;
  prompt += "```\n" + annotatedSource + "```\n";
  return prompt;
}

export async function getSimulationEnhancedPrompt(recordingId: string, repositoryContents: string): Promise<string> {
  const client = new ProtocolClient();
  await client.initialize();
  try {
    const createSessionRval = await client.sendCommand({ method: "Recording.createSession", params: { recordingId } });
    const sessionId = (createSessionRval as { sessionId: string }).sessionId;

    const { rval } = await client.sendCommand({
      method: "Session.experimentalCommand",
      params: {
        name: "analyzeExecutionPoint",
        params: {},
      },
      sessionId,
    }) as { rval: ExecutionDataAnalysisResult };;

    const { points, failureData } = rval;
    assert(failureData, "No failure data");

    const failurePoint = points.find(p => p.point === failureData.point);
    assert(failurePoint, "No failure point");

    console.log("FailureData", JSON.stringify(failureData, null, 2));

    const prompt = await enhancePromptFromFailureData(failurePoint, failureData, repositoryContents);
    console.log("Enhanced prompt", prompt);
    return prompt;
  } finally {
    client.close();
  }
}
