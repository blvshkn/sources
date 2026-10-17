const R = window.React;
function jsx(type, props, key) { return R.createElement(type, key === undefined ? props : { ...props, key }); }
module.exports = { jsx, jsxs: jsx, Fragment: R.Fragment };
