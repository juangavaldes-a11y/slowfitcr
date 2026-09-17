import { projectConfig, type ProjectModuleKey } from "./project";

export const moduleRegistry = Object.entries(projectConfig.modules).map(([key, value]) => ({
  key: key as ProjectModuleKey,
  enabled: value.enabled,
}));

export function getEnabledModules() {
  return moduleRegistry.filter((module) => module.enabled).map((module) => module.key);
}

export function isFeatureEnabled(feature: keyof typeof projectConfig.featureFlags) {
  return projectConfig.featureFlags[feature];
}
