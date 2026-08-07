const DEVICE_KEY = 'wrif-usage-device';
const EXCLUDE_KEY = 'wrif-exclude-usage';

export function getUsageDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, deviceId);
  }
  return deviceId;
}

export function isUsageExcluded() {
  return localStorage.getItem(EXCLUDE_KEY) === 'true';
}

export function setUsageExcluded(excluded: boolean) {
  localStorage.setItem(EXCLUDE_KEY, String(excluded));
}
