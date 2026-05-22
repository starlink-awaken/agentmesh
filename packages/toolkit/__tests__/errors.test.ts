/**
 * Agent Toolkit 错误模块测试
 *
 * @author PAI
 * @version 1.0.0
 */

import { describe, test, expect } from 'bun:test';
import {
  AgentToolkitError,
  LLMError,
  ValidationError,
  NetworkError,
  TimeoutError,
  AuthenticationError,
  RateLimitError,
  SessionError,
  isRetryable,
  getErrorMessage,
  compressError,
  wrapError,
  ERROR_CODES,
  Errors,
} from '../src/errors/index.js';

describe('错误类型模块', () => {
  test('基础错误类', () => {
    const error = new AgentToolkitError('测试错误', 'TEST_ERROR', {
      statusCode: 400,
      details: { field: 'test' }
    });

    expect(error).toBeInstanceOf(AgentToolkitError);
    expect(error.message).toBe('测试错误');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual({ field: 'test' });
    expect(error.timestamp).toBeInstanceOf(Date);
  });

  test('LLM错误子类', () => {
    const error = new LLMError('LLM调用失败');
    expect(error).toBeInstanceOf(LLMError);
    expect(error).toBeInstanceOf(AgentToolkitError);
    expect(error.code).toBe('LLM_ERROR');
    expect(error.name).toBe('LLMError');
  });

  test('验证错误子类', () => {
    const error = new ValidationError('验证失败');
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.code).toBe('VALIDATION_ERROR');
  });

  test('网络错误子类', () => {
    const error = new NetworkError('网络连接失败');
    expect(error).toBeInstanceOf(NetworkError);
    expect(error.code).toBe('NETWORK_ERROR');
  });

  test('超时错误子类', () => {
    const error = new TimeoutError('操作超时');
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error.code).toBe('TIMEOUT_ERROR');
  });
});

describe('错误工具函数', () => {
  test('判断是否可重试', () => {
    expect(isRetryable(new NetworkError('网络错误'))).toBe(true);
    expect(isRetryable(new TimeoutError('超时错误'))).toBe(true);
    expect(isRetryable(new AuthenticationError('认证错误'))).toBe(false);
    expect(isRetryable(new ValidationError('验证错误'))).toBe(false);
  });

  test('获取友好错误消息', () => {
    expect(getErrorMessage(new NetworkError('连接超时')))
      .toBe('网络连接失败，请检查网络连接后重试');
    expect(getErrorMessage(new AuthenticationError('无效令牌')))
      .toBe('认证失败，请检查API密钥或权限设置');
    expect(getErrorMessage(new Error('未知错误')))
      .toBe('未知错误');
  });

  test('压缩错误信息', () => {
    const error = new TimeoutError('操作超时');
    const compressed = compressError(error);

    expect(compressed.type).toBe('TimeoutError');
    expect(compressed.code).toBe('TIMEOUT_ERROR');
    expect(compressed.message).toBe('操作超时');
    expect(compressed.timestamp).toBeDefined();
  });

  test('包装错误', () => {
    const originalError = new Error('原始错误');
    const wrappedError = wrapError(originalError, 'WRAPPED_ERROR');

    expect(wrappedError).toBeInstanceOf(AgentToolkitError);
    expect(wrappedError.code).toBe('WRAPPED_ERROR');
    expect(wrappedError.message).toBe('原始错误');
  });
});

describe('错误常量和工厂', () => {
  test('错误代码常量', () => {
    expect(ERROR_CODES.LLM_ERROR).toBe('LLM_ERROR');
    expect(ERROR_CODES.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
    expect(ERROR_CODES.NETWORK_ERROR).toBe('NETWORK_ERROR');
    expect(ERROR_CODES.AUTHENTICATION_ERROR).toBe('AUTHENTICATION_ERROR');
  });

  test('错误工厂函数', () => {
    const toolkitError = Errors.toolkit('工具错误', 'TOOL_ERROR');
    expect(toolkitError).toBeInstanceOf(AgentToolkitError);
    expect(toolkitError.code).toBe('TOOL_ERROR');

    const authError = Errors.auth('认证失败');
    expect(authError).toBeInstanceOf(AuthenticationError);
    expect(authError.code).toBe('AUTHENTICATION_ERROR');
  });
});