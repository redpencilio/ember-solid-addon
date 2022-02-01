import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import Service from '@ember/service';
import { fetch, Session, getClientAuthenticationWithDependencies, onSessionRestore } from '@inrupt/solid-client-authn-browser';
import rdflib from 'ember-rdflib';
import { SOLID } from '../utils/namespaces';
import env from 'ember-get-config';

const { sym } = rdflib;

onSessionRestore((url) => {
  console.log(`We should be visiting ${url}`);
});

async function sessionPodBase(session) {
  // TODO: detect pod base by traversing upward
  const webId = session.info.webId;
  if (webId) {
    const url = new URL(webId);
    return `${url.origin}/${url.pathname.split('/')[1]}`;
  }
}

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

  get session() {
    if (this._session) {
      return this._session;
    } else {
    }
  }

  set session(session) {
    this._session = session;
  }

  get isLoggedIn() {
    const session = this.session;
    return session?.info?.isLoggedIn;
  }

  @service(env.rdfStore.name)
  store;

  async restoreSession() {
    if (this.session)
      return this.session;
    else {
      const session = new Session({
        clientAuthentication: getClientAuthenticationWithDependencies({})
      }, 'solid-store-session');

      try {
        const incomingRedirectResponse = await session.handleIncomingRedirect({ restorePreviousSession: true, url: window.location.href });
        console.log({incomingRedirectResponse});
        this.store.authSession = session;
        this.store.podBase = await sessionPodBase( session );
      } catch (e) {
        console.error(`Failed to log in: ${e}`);
      }

      this.session = session;
      return session;
    }
  }

  @service
  router

  /**
   *
   * Logs in to a solid-pod with a given provider
   *
   * @param {String} identityProvider The solid-provider to login with
   *
   * @method ensureLogin
   */
  async ensureLogin({identityProvider = null, clientName = "RDFlib NOW!", redirectUrl = window.location.href } = {}) {
    const session = await this.restoreSession();
    const isLoggedIn = session.info?.isLoggedIn;

    if( !isLoggedIn ) {
      if (identityProvider)
        window.localStorage.setItem("solid-last-identity-provider", identityProvider);
      else
        identityProvider = window.localStorage.getItem("solid-last-identity-provider");

      if (!identityProvider)
        this.router.transitionTo("login", { queryParams: { from: redirectUrl } });

      await session.login({
        oidcIssuer: identityProvider,
        redirectUrl,
        clientName
      });

      // this.session = session;
      this.store.authSession = session;
      this.store.podBase = await sessionPodBase(session);
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
    // TODO: detect pod base by traversing upward
    if (this.webId) {
      const url = new URL(this.webId);
      return `${url.origin}/${url.pathname.split('/')[1]}`;
    }
  }
}
