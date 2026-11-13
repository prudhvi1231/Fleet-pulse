import { ChaosState } from '../types.js';

class ChaosStore {
  private globalChaos: ChaosState = {
    rate: 500,
  };

  getGlobal(): ChaosState {
    return { ...this.globalChaos };
  }

  setGlobal(switches: Partial<ChaosState>): ChaosState {
    this.globalChaos = { ...this.globalChaos, ...switches };
    return this.getGlobal();
  }

  resetGlobal(): ChaosState {
    this.globalChaos = {
      rate: 500,
    };
    return this.getGlobal();
  }

  parseQuerySwitches(query: Record<string, any>): ChaosState {
    const parsed: ChaosState = { ...this.globalChaos };

    if (query.rate) {
      const r = parseInt(String(query.rate), 10);
      if (!isNaN(r) && r >= 1 && r <= 5000) parsed.rate = r;
    }

    if (query.ws) {
      const wsVal = String(query.ws);
      if (wsVal === 'down' || wsVal === 'silent') {
        parsed.ws = wsVal;
      } else if (wsVal.startsWith('drop:')) {
        const pct = parseInt(wsVal.split(':')[1], 10);
        if (!isNaN(pct)) parsed.wsDropPct = pct;
      }
    }

    if (query.sse) {
      const sseVal = String(query.sse);
      if (sseVal === 'down') parsed.sse = 'down';
    }

    if (query.chaos) {
      const parts = String(query.chaos).split(',');
      for (const part of parts) {
        if (part === 'shuffle') parsed.shuffle = true;
        if (part === 'dupe') parsed.dupe = true;
        if (part.startsWith('garbage:')) {
          const pct = parseInt(part.split(':')[1], 10);
          if (!isNaN(pct)) parsed.garbagePct = pct;
        }
      }
    }

    if (query.token_ttl) {
      const ttl = parseInt(String(query.token_ttl), 10);
      if (!isNaN(ttl)) parsed.tokenTtl = ttl;
    }

    if (query.http) {
      const httpVal = String(query.http);
      if (httpVal.startsWith('500:')) {
        const pct = parseInt(httpVal.split(':')[1], 10);
        if (!isNaN(pct)) parsed.http500Pct = pct;
      } else if (httpVal.startsWith('slow:')) {
        const ms = parseInt(httpVal.split(':')[1], 10);
        if (!isNaN(ms)) parsed.httpSlowMs = ms;
      } else if (httpVal === '429') {
        parsed.http429 = true;
      }
    }

    if (query.kill) {
      const k = parseInt(String(query.kill), 10);
      if (!isNaN(k)) parsed.killIntervalSec = k;
    }

    return parsed;
  }
}

export const chaosStore = new ChaosStore();
