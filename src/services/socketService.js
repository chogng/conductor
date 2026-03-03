import { io } from "socket.io-client";

// Production-like default: same-origin WebSocket (works with backend-served dist and with Vite proxy in dev)
const WS_URL = String(import.meta.env?.VITE_WS_URL || "").replace(/\/$/, "");

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect() {
    if (this.socket) {
      if (this.socket.connected) return;
      this.socket.connect();
      return;
    }

    const options = {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    };

    this.socket = WS_URL ? io(WS_URL, options) : io(options);

    this.socket.on("connect", () => {
      console.log("✅ WebSocket 已连接");
    });

    this.socket.on("disconnect", () => {
      console.log("❌ WebSocket 已断开");
    });

    this.socket.on("connect_error", (error) => {
      console.error("❌ WebSocket 连接错误:", error);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
  }

  // 订阅事件
  on(event, callback) {
    if (!this.socket) {
      console.warn("Socket 未连接，请先调用 connect()");
      return;
    }

    // 保存监听器引用，方便取消订阅
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);

    this.socket.on(event, callback);
  }

  // 取消订阅
  off(event, callback) {
    if (!this.socket) return;

    this.socket.off(event, callback);

    // 从监听器列表中移除
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  // 取消所有订阅
  offAll(event) {
    if (!this.socket) return;

    this.socket.off(event);
    this.listeners.delete(event);
  }

  // 发送事件（如果需要客户端主动发送）
  emit(event, data) {
    if (!this.socket) {
      console.warn("Socket 未连接");
      return;
    }
    this.socket.emit(event, data);
  }
}

export const socketService = new SocketService();
