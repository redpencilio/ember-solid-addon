import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import Service from '@ember/service';
import auth from "solid-auth-client";
import rdflib from 'ember-rdflib';
import { SOLID } from '../utils/namespaces';

const { sym } = rdflib;

/**
 *
 * Ember service used to log-in with solid and fetch profile-info and type-indexes
 *
 * @class AuthService
 *
 * @property {Session} session A solid session
 * @property {StoreService} store Rdf-store used to query data from solid
 */
export default class AuthService extends Service {
  @tracked
  session = null;

  @service("rdf-store")
  store;

  /**
   *
   * Logs in to a solid-pod with a given provider
   *
   * @param {String} identityProvider The solid-provider to login with
   *
   * @method ensureLogin
   */
  async ensureLogin(identityProvider = "https://solid.community") {
    let session = await auth.currentSession();
    if (session) {
      this.session = session;
    } else {
      auth.login(identityProvider);
    }
  }

  /**
   *
   * Fetches profile-info and the private- and public type indexes
   *
   * @method ensureTypeIndex
   */
  async ensureTypeIndex() {
    const me = sym(this.webId);

    await this.store.load(me.doc());
    // this.me = this.store.create('solid/person', me, { defaultGraph: me.doc() });

    const privateTypeIndex = this.store.any(me, SOLID("privateTypeIndex"), undefined, me.doc());
    const publicTypeIndex = this.store.any(me, SOLID("publicTypeIndex"), undefined, me.doc());

    this.store.privateTypeIndex = privateTypeIndex;
    this.store.publicTypeIndex = publicTypeIndex;
    this.store.me = me;

    await this.store.load(privateTypeIndex);
    await this.store.load(publicTypeIndex);
  }

  get webId() {
    return this.session ? this.session.webId : undefined;
  }
}
