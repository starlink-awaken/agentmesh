/**
 * OpenTelemetry instrumentation bootstrap.
 *
 * Must be imported BEFORE any other module to ensure
 * auto-instrumentation hooks apply to imported libraries.
 *
 * Usage: import './instrumentation.js' at the very top of index.ts
 *
 * Environment variables:
 *   OTEL_SERVICE_NAME     — service name (default: agentmesh-gateway)
 *   OTEL_EXPORTER_OTLP_ENDPOINT — OTLP endpoint (default: http://localhost:4318)
 *   OTEL_TRACES_SAMPLER   — sampler (default: parentbased_always_on)
 */

const { diag, DiagConsoleLogger, DiagLogLevel } = await (async () => {
  try {
    return await import('@opentelemetry/api');
  } catch {
    // OTel not installed — no-op
    return null;
  }
})() ?? {};

const sdk = await (async () => {
  if (!diag) return null;
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

  try {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');

    return new NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME || 'agentmesh-gateway',
      traceExporter: (await (async () => {
        try {
          const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
          return new OTLPTraceExporter({
            url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
          });
        } catch {
          // No OTLP exporter — falls back to console span export
          return undefined;
        }
      })()),
      instrumentations: getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fastify': { enabled: true },
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    });
  } catch {
    return null;
  }
})();

if (sdk) {
  sdk.start();
  console.log('[OTel] SDK initialized (service: agentmesh-gateway)');
  process.on('SIGTERM', () => sdk.shutdown().catch(() => {}));
} else {
  console.log('[OTel] SDK not available — instrumentation disabled');
}
