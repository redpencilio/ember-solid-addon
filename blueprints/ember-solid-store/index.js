'use strict';

module.exports = {
  description: 'Install ember-solid-data',

  availableOptions: [],

  normalizeEntityName() {
    return;
  },

  async afterInstall() {
    await this.removePackageFromProject("ember-data");
    await this.insertIntoFile('config/environment.js',
                              `\n    rdfStore: {\n      name: "store",\n      enableDataAdapter: true // Ember Inspector "Data" tab\n    },`,
                              { before: /\s*EmberENV/ }
                             );
  }
};
