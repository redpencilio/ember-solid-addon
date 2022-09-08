import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import Service from '@ember/service';
import { fetch, Session, getClientAuthenticationWithDependencies, getDefaultSession, login, handleIncomingRedirect } from '@inrupt/solid-client-authn-browser';
import rdflib from 'rdflib';
import { SOLID } from '../utils/namespaces';
import env from 'ember-get-config';

const { sym } = rdflib;

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

  get isLoggedIn() {
    const session = this.session;
    return session?.info?.isLoggedIn;
  }
  solidLastIdentityProviderKey = "solid-last-identity-provider";
  solidAuthRedirectPathKey = "solid-auth-redirect-path";

  @service(env.rdfStore.name)
  store;

  @service
  router;

  async restoreSession() {
    if (this.session)
      return this.session;
    else {
      const session = new Session({
        clientAuthentication: getClientAuthenticationWithDependencies({})
      }, 'solid-store-session');

      try {
        const redirectPath = window.localStorage.getItem(this.solidAuthRedirectPathKey);
        if( !redirectPath )
          window.localStorage.setItem(this.solidAuthRedirectPathKey, window.location.href);

        const incomingRedirectResponse = await session.handleIncomingRedirect({ restorePreviousSession: true, url: window.location.href });
        console.log({incomingRedirectResponse});
        this.store.authSession = session;
        this.store.podBase = await sessionPodBase( session );

        window.localStorage.removeItem(this.solidAuthRedirectPathKey);
        if( redirectPath ) {
          const url = new URL(redirectPath);
          let recognized;
          if( this.router.location.implementation == "hash" ) {
            recognized = this.router.recognize( url.hash.slice(1) );
          } else {
            recognized = this.router.recognize( url.href.slice(url.origin.length) );
          }
          this.router.replaceWith( recognized.name, Object.assign( {}, recognized.params, { queryParams: recognized.queryParams }) );
        }
      } catch (e) {
        console.error(`Failed to log in: ${e}`);
      }

      this.session = session;
      return this.session;
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
  async ensureLogin({identityProvider = null, clientName = "Ember Solid!", redirectUrl = window.location.href } = {}) {
    const session = await this.restoreSession();
    const isLoggedIn = session.info?.isLoggedIn;

    if( !isLoggedIn ) {
      if (identityProvider)
        window.localStorage.setItem(this.solidLastIdentityProviderKey, identityProvider);
      else
        identityProvider = window.localStorage.getItem(this.solidLastIdentityProviderKey);

      redirectUrl = redirectUrl || window.location.href;

      window.localStorage.setItem(this.solidAuthRedirectPathKey, redirectUrl);

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
   * Logs out of the current solid-pod.
   *
   * @method ensureLogout
   */
  async ensureLogout(){
    const session = await this.restoreSession();
    const isLoggedIn = session.info?.isLoggedIn;
    if( isLoggedIn ) {
      await session.logout();
    }
    window.localStorage.removeItem(this.solidLastIdentityProviderKey);
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
