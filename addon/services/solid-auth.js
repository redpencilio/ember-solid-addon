import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import Service from '@ember/service';
import { fetch, Session, getClientAuthenticationWithDependencies } from '@inrupt/solid-client-authn-browser';
import rdflib from 'ember-rdflib';
import { SOLID } from '../utils/namespaces';
import env from 'ember-get-config';

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

  @service(env.rdfStore.name)
  store;

  /**
   *
   * Logs in to a solid-pod with a given provider
   *
   * @param {String} identityProvider The solid-provider to login with
   *
   * @method ensureLogin
   */
  async ensureLogin(identityProvider = "https://solid.redpencil.io/", clientName = "RDFlib NOW!") {
    if (!this.session) {
      const session = new Session({
        clientAuthentication: getClientAuthenticationWithDependencies({})
      }, 'mySession');

      await session.handleIncomingRedirect({ restorePreviousSession: true });

      if (!session.info.isLoggedIn) {
        await session.login({
          oidcIssuer: identityProvider,
          redirectUrl: window.location.href,
          clientName: clientName
        });
      }

      this.session = session;
      this.store.authSession = session;
      this.store.podBase = this.podBase;
    }
  }

  /**
   *
   * Fetches profile-info and the private- and public type indexes
   *
   * @method ensureTypeIndex
   */
  async ensureTypeIndex() {
    await this.store.load(this.webIdSym.doc());

    const privateTypeIndex = this.privateTypeIndexLocation;
    this.store.privateTypeIndex = privateTypeIndex;
    await this.store.load(privateTypeIndex);

    const publicTypeIndex = this.publicTypeIndexLocation;
    this.store.publicTypeIndex = publicTypeIndex;
    await this.store.load(publicTypeIndex);
  }

  get privateTypeIndexLocation() {
    return this.store.any(this.webIdSym, SOLID("privateTypeIndex"), undefined, this.webIdSym.doc())
      || `#{this.podBase}/settings}/privateTypeIndex`;
  }

  get publicTypeIndexLocation() {
    return this.story.any(this.webIdSym, SOLID("publicTypeIndex"), undefined, this.webIdSym.doc())
      || `#{this.podBase}/settings}/publicTypeIndex`;
  }

  get webId() {
    return this.session?.info?.webId;
  }

  get webIdSym() {
    return sym(this.webId);
  }

  get podBase() {
    if (this.webId) {
      const url = new URL(this.webId);
      return `${url.origin}/${url.pathname.split('/')[1]}`;
    }
  }
}
