'use strict';

module.exports = {
  name: require('./package').name,

  included: function() {
    this._super.included.apply(this, arguments);
    this.import('node_modules/solid-auth-client/bin/solid-auth-client.js');
  }
};
