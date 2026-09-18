import { getEnabledModules, isFeatureEnabled, projectConfig } from "./index";

export type RuntimeFeatureKey = keyof typeof projectConfig.featureFlags;

export function getRuntimeFlags() {
  return {
    enabledModules: getEnabledModules(),
    modules: projectConfig.modules,
    providers: projectConfig.providers,
    features: projectConfig.featureFlags,
  };
}

export function isRuntimeFeatureEnabled(feature: RuntimeFeatureKey) {
  return isFeatureEnabled(feature);
}

export function getRuntimeModuleStatus(module: keyof typeof projectConfig.modules) {
  return projectConfig.modules[module].enabled;
}

export function getRuntimeProviderStatus(provider: keyof typeof projectConfig.providers) {
  return projectConfig.providers[provider].enabled;
}

export function getRuntimeConfig() {
  return {
    brand: projectConfig.brand,
    theme: projectConfig.theme,
    modules: projectConfig.modules,
    providers: projectConfig.providers,
    features: projectConfig.featureFlags,
  };
}
