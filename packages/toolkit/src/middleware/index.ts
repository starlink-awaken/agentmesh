/**
 * Middleware Module - 中间件系统
 *
 * 提供中间件/拦截器的核心类型和实现
 *
 * @author PAI
 * @version 1.0.0
 */

// Types
export type {
  MiddlewareContext,
  MiddlewareNext,
  MiddlewareFunc,
  MiddlewareError,
  MiddlewareState,
  MiddlewareConfig,
  MiddlewareChainConfig,
  Request,
  Response,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorHandler,
  RateLimitConfig,
  RateLimitEntry,
  LogLevel,
  LoggingConfig,
  Logger,
} from './types.js';

export { ConsoleLogger } from './types.js';

// MiddlewareChain
export {
  MiddlewareChain,
  createContext,
  createError,
  createStopMiddleware,
  compose,
} from './MiddlewareChain.js';

// RequestInterceptor
export {
  RequestInterceptorManager,
  createRequestInterceptorManager,
  createHeaderValidator,
  createBodySizeLimiter,
  createPathNormalizer,
  createJSONBodyParser,
  createCORSPreflightHandler,
} from './RequestInterceptor.js';

// ResponseInterceptor
export {
  ResponseInterceptorManager,
  createResponseInterceptorManager,
  createResponseTimeTracker,
  createCORSAdder,
  createResponseCompressor,
  createJSONFormatter,
  createErrorFormatter,
  createSuccessWrapper,
} from './ResponseInterceptor.js';

// ErrorMiddleware
export {
  ErrorMiddleware,
  createErrorMiddleware,
  createErrorResponder,
} from './ErrorMiddleware.js';

export type {
  ErrorRecoveryOptions,
  ErrorRecoveryContext,
} from './ErrorMiddleware.js';

// LoggingMiddleware
export {
  LoggingMiddleware,
  createLoggingMiddleware,
  createRequestLogger,
  createDebugLogger,
} from './LoggingMiddleware.js';

export type {
  LogEntry,
} from './LoggingMiddleware.js';

// RateLimitMiddleware
export {
  RateLimitMiddleware,
  MemoryRateLimitStore,
  createRateLimitMiddleware,
  createIPRateLimitMiddleware,
  createUserRateLimitMiddleware,
} from './RateLimitMiddleware.js';

export type {
  RateLimitStore,
} from './RateLimitMiddleware.js';

// ValidationMiddleware
export {
  ValidationMiddleware,
  createValidationMiddleware,
  validateRequest,
  createSchemaValidator,
  createFieldValidator,
  ValidationError,
} from './ValidationMiddleware.js';

export type {
  ValidationOptions,
  RequestValidationOptions,
} from './ValidationMiddleware.js';

// Validation Schemas
export {
  createStringSchema,
  createNumberSchema,
  createBooleanSchema,
  createEmailSchema,
  createUrlSchema,
  createObjectSchema,
  createArraySchema,
  createDateSchema,
  createCustomSchema,
} from './schemas.js';

export type {
  ValidationSchema,
  ValidationResult,
  ValidationErrorDetail,
  StringValidationOptions,
  NumberValidationOptions,
  BooleanValidationOptions,
  EmailValidationOptions,
  UrlValidationOptions,
  ObjectValidationOptions,
  ArrayValidationOptions,
} from './schemas.js';

// SecurityMiddleware
export {
  SecurityMiddleware,
  createSecurityMiddleware,
  createXSSProtectionMiddleware,
  createSQLInjectionProtectionMiddleware,
  createRequestSizeLimiter,
  createDangerousCharacterFilter,
  createComprehensiveSecurityMiddleware,
  SecurityError,
} from './SecurityMiddleware.js';

export type {
  SecurityOptions,
} from './SecurityMiddleware.js';
