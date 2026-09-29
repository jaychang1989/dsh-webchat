/**
 * Browser-side API client for the /api/dsh-webchat route family. The only
 * data access path the panel components use — plain fetch, same origin.
 */
import { type TransferMode, type WebChatState } from '../protocol.ts';
/** Shape every /api/dsh-webchat response carries: ok plus optional error. */
interface ApiResult {
    ok: boolean;
    error?: string;
}
/** Endpoint payloads always extend ApiResult. */
type EndpointResult<T> = T & ApiResult;
export declare class WebChatApi {
    state(): Promise<EndpointResult<WebChatState>>;
    openLogin(): Promise<EndpointResult<{
        ok: boolean;
    }>>;
    closeBrowser(): Promise<EndpointResult<{
        ok: boolean;
    }>>;
    newChat(): Promise<EndpointResult<{
        ok: boolean;
        chatId?: string;
    }>>;
    send(text: string, images?: string[]): Promise<EndpointResult<{
        ok: boolean;
        chatId?: string;
    }>>;
    stop(): Promise<EndpointResult<{
        ok: boolean;
    }>>;
    setDeepThink(enabled: boolean): Promise<EndpointResult<{
        ok: boolean;
    }>>;
    setSearch(enabled: boolean): Promise<EndpointResult<{
        ok: boolean;
    }>>;
    transfer(chatId: string, cwd?: string, mode?: TransferMode, workspaceId?: string, targetSessionId?: string): Promise<EndpointResult<{
        ok: boolean;
        sessionId?: string;
        distilled?: boolean;
        attached?: boolean;
        continued?: boolean;
        workspaceId?: string;
    }>>;
    exportFile(chatId: string, cwd?: string): Promise<EndpointResult<{
        ok: boolean;
        filePath?: string;
    }>>;
    renameChat(chatId: string, title: string): Promise<EndpointResult<{
        ok: boolean;
    }>>;
    deleteChat(chatId: string): Promise<EndpointResult<{
        ok: boolean;
    }>>;
    clearChats(): Promise<EndpointResult<{
        ok: boolean;
        count?: number;
    }>>;
    webChats(): Promise<EndpointResult<{
        ok: boolean;
        web: Array<{
            title: string;
        }>;
        missing: string[];
    }>>;
    recover(title: string): Promise<EndpointResult<{
        ok: boolean;
        chatId?: string;
        title?: string;
        created?: boolean;
    }>>;
}
export {};
