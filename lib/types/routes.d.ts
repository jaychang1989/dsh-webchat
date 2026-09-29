/**
 * The /api/dsh-webchat route family: engine state, browser login control,
 * chat operations (new chat / send / stop / switch model), transcript
 * export, and the harness transfer that seeds a new session with a web
 * transcript. Every route carries the same loopback-only trust fence the
 * dsh-ssh plugin uses — these endpoints drive a browser and create sessions,
 * so LAN-exposed deployments must not serve them.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { DeepSeekWebEngine } from './engine/engine.ts';
import type { TranscriptStore } from './store.ts';
import type { DistillConfig } from './transfer.ts';
/** Route family dependencies. */
export interface WebChatRoutesDeps {
    ctx: Context;
    engine: DeepSeekWebEngine;
    store: TranscriptStore;
    distill: DistillConfig;
}
/** Build every /api/dsh-webchat route. */
export declare function makeRoutes(deps: WebChatRoutesDeps): WebRoute[];
