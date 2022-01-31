'use strict';

module.exports = {
  description: 'Install ember-solid-data',

  availableOptions: [],

  normalizeEntityName() {
    return;
  },

  afterInstall() {
    this.removePackageFromProject("ember-data");
  }
};
