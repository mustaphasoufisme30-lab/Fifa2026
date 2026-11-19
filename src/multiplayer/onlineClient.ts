import { InputSnapshot } from '../core/types';
import { ClientToServerMessage, ServerToClientMessage } from './protocol';

export type OnlineSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface OnlineClientListeners {
  onStatusChange?: (status: OnlineSocketStatus) => void;
  onLatencyChange?: (latencyMs: number) => void;
  onMessage?: (msg: ServerToClientMessage) => void;
}

export class OnlineMultiplayerClient {
  private ws: WebSocket | null = null;
  private status: OnlineSocketStatus = 'disconnected';
  private listeners: OnlineClientListeners;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private reconnectAttempts = 0;
  private shouldReconnect = false;
  private activeSession: { roomCode: string; uid: string } | null = null;
  private lastInputSentAt = 0;
  private lastSentAxes = { moveX: 0, moveZ: 0, sprint: false, shootHeld: false };
  private outboundQueue: ClientToServerMessage[] = [];

  constructor(listeners: OnlineClientListeners) {
    this.listeners = listeners;
  }

  public setActiveSession(session: { roomCode: string; uid: string } | null): void {
    this.activeSession = session;
  }

  public getStatus(): OnlineSocketStatus {
    return this.status;
  }

  public connect(): void {
    if (typeof window === 'undefined') return;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.shouldReconnect = true;
    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus('connected');
        this.startPingLoop();

        // Automatically rejoin active match/room after network recovery
        if (this.activeSession) {
          this.sendRaw({
            type: 'room:reconnect',
            roomCode: this.activeSession.roomCode,
            uid: this.activeSession.uid,
          });
        }

        while (this.outboundQueue.length > 0) {
          const queued = this.outboundQueue.shift();
          if (queued) this.sendRaw(queued);
        }
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as ServerToClientMessage;
          if (msg.type === 'pong') {
            const rtt = Math.max(1, Math.round(Date.now() - msg.clientTime));
            this.listeners.onLatencyChange?.(rtt);
            return;
          }
          this.listeners.onMessage?.(msg);
        } catch {
          // Ignore malformed packet
        }
      };

      ws.onclose = () => {
        this.stopPingLoop();
        this.ws = null;
        if (this.shouldReconnect) {
          this.setStatus('reconnecting');
          this.scheduleReconnect();
        } else {
          this.setStatus('disconnected');
        }
      };

      ws.onerror = () => {
        // onclose will trigger automatic reconnect
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    this.activeSession = null;
    this.outboundQueue = [];
    this.stopPingLoop();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  public send(msg: ClientToServerMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendRaw(msg);
      return;
    }
    if (msg.type !== 'match:input' && msg.type !== 'ping') {
      this.outboundQueue.push(msg);
    }
    if (!this.ws && this.shouldReconnect) {
      this.connect();
    }
  }

  /**
   * Throttled input sender (~25 Hz for continuous movement, immediate flush on discrete actions).
   */
  public sendInput(input: InputSnapshot): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const now = performance.now();
    const hasDiscrete =
      input.passPressed ||
      input.lobPressed ||
      input.shootPressed ||
      input.shootReleased ||
      input.tacklePressed ||
      input.switchPressed;

    const axesChanged =
      Math.abs(input.moveX - this.lastSentAxes.moveX) > 0.04 ||
      Math.abs(input.moveZ - this.lastSentAxes.moveZ) > 0.04 ||
      input.sprint !== this.lastSentAxes.sprint ||
      input.shootHeld !== this.lastSentAxes.shootHeld;

    const minInterval = hasDiscrete ? 0 : axesChanged ? 38 : 120;
    if (now - this.lastInputSentAt < minInterval) return;

    this.lastInputSentAt = now;
    this.lastSentAxes = {
      moveX: input.moveX,
      moveZ: input.moveZ,
      sprint: input.sprint,
      shootHeld: input.shootHeld,
    };

    this.sendRaw({ type: 'match:input', input });
  }

  private sendRaw(msg: ClientToServerMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.sendRaw({ type: 'ping', clientTime: Date.now() });
    this.pingTimer = window.setInterval(() => {
      this.sendRaw({ type: 'ping', clientTime: Date.now() });
    }, 3000);
  }

  private stopPingLoop(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay = Math.min(4000, 800 * Math.pow(1.6, this.reconnectAttempts));
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) {
        this.connect();
      }
    }, delay);
  }

  private setStatus(next: OnlineSocketStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.listeners.onStatusChange?.(next);
  }
}
