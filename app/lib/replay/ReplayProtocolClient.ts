const replayWsServer = process.env["REPLAY_DISPATCH_URL"] || "wss://dispatch.replay.io";

export function assert(condition: any, message: string = "Assertion failed!"): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function defer<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: any) => void } {
  let resolve: (value: T) => void;
  let reject: (reason?: any) => void;
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return { promise, resolve: resolve!, reject: reject! };
}

export function uint8ArrayToBase64(data: Uint8Array) {
  let str = "";
  for (const byte of data) {
    str += String.fromCharCode(byte);
  }
  return btoa(str);
}

export function stringToBase64(inputString: string) {
  if (typeof inputString !== "string") {
      throw new TypeError("Input must be a string.");
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(inputString);
  return uint8ArrayToBase64(data);
}

function logDebug(msg: string, tags: Record<string, any> = {}) {
  console.log(msg, JSON.stringify(tags));
}

class ProtocolError extends Error {
  protocolCode;
  protocolMessage;
  protocolData;

  constructor(error: any) {
    super(`protocol error ${error.code}: ${error.message}`);

    this.protocolCode = error.code;
    this.protocolMessage = error.message;
    this.protocolData = error.data ?? {};
  }

  toString() {
    return `Protocol error ${this.protocolCode}: ${this.protocolMessage}`;
  }
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve: (value: T) => void;
  let reject: (reason?: any) => void;
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return { promise, resolve: resolve!, reject: reject! };
}

type EventListener = (params: any) => void;

export class ProtocolClient {
  openDeferred = createDeferred<void>();
  eventListeners = new Map<string, Set<EventListener>>();
  nextMessageId = 1;
  pendingCommands = new Map<number, Deferred<any>>();
  socket: WebSocket;

  constructor() {
    logDebug(`Creating WebSocket for ${replayWsServer}`);

    this.socket = new WebSocket(replayWsServer);

    this.socket.addEventListener("close", this.onSocketClose);
    this.socket.addEventListener("error", this.onSocketError);
    this.socket.addEventListener("open", this.onSocketOpen);
    this.socket.addEventListener("message", this.onSocketMessage);

    this.listenForMessage("Recording.sessionError", (error: any) => {
      logDebug(`Session error ${error}`);
    });
  }

  initialize() {
    return this.openDeferred.promise;
  }

  close() {
    this.socket.close();
  }

  listenForMessage(method: string, callback: (params: any) => void) {
    let listeners = this.eventListeners.get(method);
    if (listeners == null) {
      listeners = new Set([callback]);

      this.eventListeners.set(method, listeners);
    } else {
      listeners.add(callback);
    }

    return () => {
      listeners.delete(callback);
    };
  }

  sendCommand(args: { method: string; params: any; sessionId?: string }) {
    const id = this.nextMessageId++;

    const { method, params, sessionId } = args;
    logDebug("Sending command", { id, method, params, sessionId });

    const command = {
      id,
      method,
      params,
      sessionId,
    };

    this.socket.send(JSON.stringify(command));

    const deferred = createDeferred();
    this.pendingCommands.set(id, deferred);
    return deferred.promise;
  }

  onSocketClose = () => {
    logDebug("Socket closed");
  };

  onSocketError = (error: any) => {
    logDebug(`Socket error ${error}`);
  };

  onSocketMessage = (event: MessageEvent) => {
    const { error, id, method, params, result } = JSON.parse(String(event.data));

    if (id) {
      const deferred = this.pendingCommands.get(id);
      assert(deferred, `Received message with unknown id: ${id}`);

      this.pendingCommands.delete(id);
      if (result) {
        deferred.resolve(result);
      } else if (error) {
        console.error("ProtocolError", error);
        deferred.reject(new ProtocolError(error));
      } else {
        deferred.reject(new Error("Channel error"));
      }
    } else if (this.eventListeners.has(method)) {
      const callbacks = this.eventListeners.get(method);
      if (callbacks) {
        callbacks.forEach(callback => callback(params));
      }
    } else {
      logDebug("Received message without a handler", { method, params });
    }
  };

  onSocketOpen = async () => {
    logDebug("Socket opened");
    this.openDeferred.resolve();
  };
}

// Send a single command with a one-use protocol client.
export async function sendCommandDedicatedClient(args: { method: string; params: any }) {
  const client = new ProtocolClient();
  await client.initialize();
  try {
    const rval = await client.sendCommand(args);
    client.close();
    return rval;
  } finally {
    client.close();
  }
}
