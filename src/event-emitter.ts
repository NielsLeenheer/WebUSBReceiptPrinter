type EventCallback = (...args: any[]) => void;

class EventEmitter {
    private _events: { [key: string]: EventCallback[] };

    constructor() {
        this._events = {};
    }

    on(e: string, f: EventCallback): void {
        this._events[e] = this._events[e] || [];
        this._events[e].push(f);
    }

    emit(e: string, ...args: any[]): void {
        const fs = this._events[e];
        if (fs) {
            fs.forEach(f => {
                setTimeout(() => f(...args), 0);
            });
        }
    }        
}

export default EventEmitter;
