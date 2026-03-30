// [SECURITY CLEANUP] This file has been neutralized.
// License expiration overlays and blocking logic have been removed.

(function () {
  'use strict';

  window.ExpiredOverlay = {
    createPopupExpiredOverlay: () => { },
    removePopupExpiredOverlay: () => { },
    createFacebookExpiredButton: () => { },
    checkLicenseExpiry: (cb) => cb(false),
    checkAndActivateLicense: async () => true,
    startLicensePolling: () => { },
    switchToRegularOverlay: () => { }
  };
})();
