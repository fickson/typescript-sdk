export function detectDeploymentUrl(): string | undefined {
  if (typeof process === "undefined" || !process.env) {
    return undefined;
  }

  if (process.env.SEKUIRE_DEPLOYMENT_URL) {
    return process.env.SEKUIRE_DEPLOYMENT_URL;
  }

  if (process.env.FLY_APP_NAME) {
    return `https://${process.env.FLY_APP_NAME}.fly.dev`;
  }

  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }

  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  if (process.env.HEROKU_APP_NAME) {
    return `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`;
  }

  if (process.env.K_SERVICE && process.env.K_REVISION) {
    const region = process.env.GOOGLE_CLOUD_REGION || "us-central1";
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    if (project) {
      return `https://${process.env.K_SERVICE}-${project}.${region}.run.app`;
    }
  }

  if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
    if (process.env.AWS_LAMBDA_FUNCTION_URL) {
      return process.env.AWS_LAMBDA_FUNCTION_URL;
    }
  }

  if (process.env.WEBSITE_HOSTNAME) {
    return `https://${process.env.WEBSITE_HOSTNAME}`;
  }

  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }

  return undefined;
}
