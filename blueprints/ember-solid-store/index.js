'use strict';

module.exports = {
  description: 'Install ember-solid-data',

  availableOptions: [],

  normalizeEntityName() {
    return;
  },

  async afterInstall() {
    try {
      await this.removePackageFromProject("ember-data");
    } catch (e) {
    }
    await this.insertIntoFile('config/environment.js',
                              `\n    rdfStore: {\n      name: "store",\n      enableDataAdapter: true // Ember Inspector "Data" tab\n    },`,
                              { before: /\s*EmberENV/ }
                             );
    await this.insertIntoFile('app/router.js',
                              `\n  this.route('login');`,
                              { after: /Router.map.*/ });
  }
};
