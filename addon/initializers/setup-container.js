export function initialize( application ) {
  application.registerOptionsForType('model', { singleton: true, instantiate: false });
}

export default {
  initialize
};
