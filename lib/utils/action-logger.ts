export async function withTelemetry<T>(actionName: string, actionFn: () => Promise<T>): Promise<T> {
    const startTime = performance.now();
    try {
        const result = await actionFn();
        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);
        
        // Structured JSON Logging for External Observability (e.g. Datadog, Cloudwatch)
        console.info(JSON.stringify({
            event: "ACTION_PERFORMANCE",
            action: actionName,
            status: "SUCCESS",
            latencyMs: latency,
            timestamp: new Date().toISOString()
        }));

        if (latency > 1500) {
            console.warn(JSON.stringify({
                event: "ACTION_PERFORMANCE_WARNING",
                action: actionName,
                message: "Endpoint exceeded 1500ms SLA",
                latencyMs: latency
            }));
        }

        return result;
    } catch (error: any) {
        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);

        console.error(JSON.stringify({
            event: "ACTION_ERROR",
            action: actionName,
            status: "ERROR",
            latencyMs: latency,
            errorMessage: error.message || String(error),
            timestamp: new Date().toISOString()
        }));

        throw error;
    }
}
