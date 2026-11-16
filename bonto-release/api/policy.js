export function isAllowedSocialLink(value) { try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
}
catch {
    return false;
} }
export function isAllowedPushEndpoint(value) { try {
    const endpoint = new URL(value);
    const host = endpoint.hostname;
    const allowed = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
    return endpoint.protocol === 'https:' && !endpoint.port && !endpoint.username && !endpoint.password && allowed;
}
catch {
    return false;
} }
