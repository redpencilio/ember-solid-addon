import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import Component from '@glimmer/component';
import rdflib from 'ember-rdflib';
import env from '../../config/environment';

const { Fetcher, namedNode } = rdflib;

export default class SolidCardInfoComponent extends Component {
  @service('solid-auth') auth;
  @service('rdf-store') store;

  constructor() {
    super(...arguments);
    this.fetchVcard();
  }

  @tracked
  me = null;

  @action
  async fetchVcard() {
    await this.auth.ensureLogin();
    await this.auth.ensureTypeIndex();
    const graph = this.store.store.graph;
    const me = graph.sym(this.auth.webId);
    console.log(me);
    const fetcher = new Fetcher(graph);
    console.log(await fetcher.load(me));
    console.log(graph);
    console.log(me.doc());

    this.me = this.store.create('solid/person', me, { defaultGraph: me.doc() });
    console.log(this.me);
  }

  @action
  saveUser(event) {
    event.preventDefault();
    console.log('save');
    this.store.persist();
  }
}
