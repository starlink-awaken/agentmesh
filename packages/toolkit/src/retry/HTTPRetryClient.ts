/**
 * Retry 模块 - HTTP 重试客户端
 *
 * @author PAI
 * @version 1.0.0
 */

import { request } from 'undici';
import {
  RetryableClient,
  createRetryableClient,
} from './RetryableClient.js';
import {
  RetryConfig,
  HTTPRequestConfig,
  HTTPResponse,
  HTTPClientConfig,
  DEFAULT_RETRY_CONFIG,
  HTTP_STATUS_RETRY,
} from './types.js';

/**
 * 判断是否是可重试的 HTTP 错误
 */
function isRetryableHTTPError(status: number, error: Error): boolean {
  // 重试 5xx 服务器错误
  if (HTTP_STATUS_RETRY.includes(status)) {
    return true;
  }
  // 重试网络错误
  return DEFAULT_RETRY_CONFIG.retryOn(error);
}

/**
 * HTTP 重试客户端
 */
export class HTTPRetryClient {
  private retryClient: RetryableClient;
  private defaultConfig: HTTPClientConfig;

  constructor(config: HTTPClientConfig = {}) {
    this.retryClient = createRetryableClient(config.defaultRetry);
    this.defaultConfig = config;
  }

  /**
   * 执行 HTTP 请求
   */
  async request<T = unknown>(config: HTTPRequestConfig): Promise<HTTPResponse<T>> {
    const mergedRetryConfig: RetryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...this.defaultConfig.defaultRetry,
      ...config.retry,
      retryOn: (error: Error) => {
        // 首先检查是否是网络错误
        if (DEFAULT_RETRY_CONFIG.retryOn(error)) {
          return true;
        }
        // 如果有响应，检查状态码
        return false; // 状态码检查在下面的回调中处理
      },
    };

    const timeout = config.timeout ?? this.defaultConfig.defaultTimeout ?? 30000;
    const headers = {
      ...this.defaultConfig.defaultHeaders,
      ...config.headers,
    };

    const maxRetries = mergedRetryConfig.maxRetries;

    // 使用 retryClient 包装请求
    const result = await this.retryClient.execute<HTTPResponse<T>>(
      async () => {
        return this.doRequest<T>({
          url: config.url,
          method: config.method ?? 'GET',
          headers,
          body: config.body,
          timeout,
        });
      },
      {
        ...mergedRetryConfig,
        retryOn: (error: Error) => {
          // 总是重试网络错误
          if (DEFAULT_RETRY_CONFIG.retryOn(error)) {
            return true;
          }
          // 检查错误中是否包含 HTTP 状态码
          const message = error.message;
          const statusMatch = message.match(/status[:\s]*(5\d{2}|429|408)/i);
          if (statusMatch) {
            return true;
          }
          return false;
        },
      }
    );

    if (!result.success) {
      throw result.error;
    }

    return result.result!;
  }

  /**
   * 执行实际请求
   */
  private async doRequest<T>(config: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: unknown;
    timeout: number;
  }): Promise<HTTPResponse<T>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestOptions: any = {
      method: config.method,
      headers: config.headers,
      timeout: config.timeout,
    };

    if (config.body !== undefined) {
      if (typeof config.body === 'string') {
        requestOptions.body = config.body;
      } else {
        requestOptions.body = JSON.stringify(config.body);
        if (!requestOptions.headers) {
          requestOptions.headers = {};
        }
        if (!requestOptions.headers['Content-Type']) {
          requestOptions.headers['Content-Type'] = 'application/json';
        }
      }
    }

    const response = await request(config.url, requestOptions);

    let data: T;
    const contentType = response.headers['content-type'] || '';

    if (contentType.includes('application/json')) {
      data = (await response.body.json()) as T;
    } else {
      data = (await response.body.text()) as unknown as T;
    }

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      } else if (Array.isArray(value)) {
        headers[key] = value.join(', ');
      }
    }

    // 如果状态码表示错误，抛出错误
    if (response.statusCode >= 400) {
      const statusText = (response as unknown as { statusMessage?: string }).statusMessage ||
        headers['status'] ||
        'Unknown error';
      const error = new Error(
        `HTTP ${response.statusCode}: ${statusText}`
      );
      // 将状态码附加到错误消息中以便重试逻辑使用
      (error as Error & { statusCode?: number }).statusCode = response.statusCode;
      throw error;
    }

    return {
      status: response.statusCode,
      statusText: (response as unknown as { statusMessage?: string }).statusMessage || headers['status'] || '',
      headers,
      data,
    };
  }

  /**
   * GET 请求
   */
  async get<T = unknown>(
    url: string,
    config?: Partial<HTTPRequestConfig>
  ): Promise<HTTPResponse<T>> {
    return this.request<T>({
      url,
      method: 'GET',
      ...config,
    });
  }

  /**
   * POST 请求
   */
  async post<T = unknown>(
    url: string,
    body?: unknown,
    config?: Partial<HTTPRequestConfig>
  ): Promise<HTTPResponse<T>> {
    return this.request<T>({
      url,
      method: 'POST',
      body,
      ...config,
    });
  }

  /**
   * PUT 请求
   */
  async put<T = unknown>(
    url: string,
    body?: unknown,
    config?: Partial<HTTPRequestConfig>
  ): Promise<HTTPResponse<T>> {
    return this.request<T>({
      url,
      method: 'PUT',
      body,
      ...config,
    });
  }

  /**
   * DELETE 请求
   */
  async delete<T = unknown>(
    url: string,
    config?: Partial<HTTPRequestConfig>
  ): Promise<HTTPResponse<T>> {
    return this.request<T>({
      url,
      method: 'DELETE',
      ...config,
    });
  }

  /**
   * PATCH 请求
   */
  async patch<T = unknown>(
    url: string,
    body?: unknown,
    config?: Partial<HTTPRequestConfig>
  ): Promise<HTTPResponse<T>> {
    return this.request<T>({
      url,
      method: 'PATCH',
      body,
      ...config,
    });
  }
}

/**
 * 创建 HTTP 重试客户端
 */
export function createHTTPRetryClient(config?: HTTPClientConfig): HTTPRetryClient {
  return new HTTPRetryClient(config);
}
