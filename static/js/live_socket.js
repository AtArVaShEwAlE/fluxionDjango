// Socket.IO-style wrapper over a native WebSocket.
// Wire format: {"event": name, "data": {...}}  (matches streaming/consumers.py)
(function () {
    class LiveSocket {
        constructor(path) {
            this.path = path || '/ws/live/';
            this.handlers = {};
            this.queue = [];            // messages emitted before the socket is open
            this.connected = false;
            this.closedByUser = false;
            this.retryDelay = 1000;
            this.connect();
        }

        on(event, handler) {
            (this.handlers[event] = this.handlers[event] || []).push(handler);
            return this;
        }

        off(event, handler) {
            if (!this.handlers[event]) return this;
            this.handlers[event] = handler
                ? this.handlers[event].filter(h => h !== handler)
                : [];
            return this;
        }

        _fire(event, data) {
            (this.handlers[event] || []).forEach(handler => {
                try { handler(data); } catch (err) { console.error(`Handler for "${event}" failed:`, err); }
            });
        }

        connect() {
            this.closedByUser = false;
            const scheme = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
            this.ws = new WebSocket(scheme + window.location.host + this.path);

            this.ws.onopen = () => {
                this.connected = true;
                this.retryDelay = 1000;
                this._fire('connect');
                this._flush();
            };

            this.ws.onmessage = (e) => {
                let msg;
                try { msg = JSON.parse(e.data); } catch (err) { return; }
                if (msg && msg.event) this._fire(msg.event, msg.data);
            };

            this.ws.onclose = () => {
                const wasConnected = this.connected;
                this.connected = false;
                this._fire(wasConnected ? 'disconnect' : 'connect_error');
                if (!this.closedByUser) {
                    setTimeout(() => this.connect(), this.retryDelay);
                    this.retryDelay = Math.min(this.retryDelay * 2, 10000);   // back off up to 10s
                }
            };

            this.ws.onerror = () => { /* onclose handles it */ };
        }

        emit(event, data) {
            const payload = JSON.stringify({
                event: event,
                data: (data && typeof data === 'object') ? data : {}
            });
            if (this.connected) this.ws.send(payload);
            else this.queue.push(payload);
            return this;
        }

        _flush() {
            while (this.queue.length && this.connected) this.ws.send(this.queue.shift());
        }

        disconnect() {
            this.closedByUser = true;
            this.queue = [];
            if (this.ws) this.ws.close();
            return this;
        }
    }

    window.LiveSocket = LiveSocket;
    window.io = function () { return new LiveSocket(); };   // drop-in for socket.io's io()
})();