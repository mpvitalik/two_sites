const BACKSTOP_TEST_CSS_OVERRIDE = `
  *:not([class*="loader"]):not([class*="spinner"]):not([class*="splash"]):not([class*="preloader"]) {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
`;

module.exports = async (page, scenario) => {
  try {
    await page.addStyleTag({
      content: BACKSTOP_TEST_CSS_OVERRIDE
    });
    console.log('BACKSTOP_TEST_CSS_OVERRIDE injected for: ' + scenario.label);
  } catch (err) {
    console.error('Error injecting CSS override:', err.message);
  }
};
