// Simple in-memory rate limiter for development
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 5; // 5 requests per minute

export async function rateLimit(req: Request) {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const now = Date.now();
  
  // Get or initialize request count for this IP
  let requestData = requestCounts.get(ip);
  if (!requestData || now > requestData.resetTime) {
    requestData = { count: 0, resetTime: now + WINDOW_MS };
    requestCounts.set(ip, requestData);
  }

  // Increment request count
  requestData.count++;

  // Check if rate limit exceeded
  const success = requestData.count <= MAX_REQUESTS;

  return {
    success,
    limit: MAX_REQUESTS,
    reset: requestData.resetTime,
    remaining: Math.max(0, MAX_REQUESTS - requestData.count)
  };
} 