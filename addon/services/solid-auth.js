import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import Service from '@ember/service';
import { fetch, Session, getClientAuthenticationWithDependencies, getDefaultSession, login, handleIncomingRedirect } from '@inrupt/solid-client-authn-browser';
import rdflib from 'ember-rdflib';
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
        const redirectPath = window.localStorage.getItem("solid-auth-redirect-path");
        if( !redirectPath )
          window.localStorage.setItem("solid-auth-redirect-path", window.location.href);

        const incomingRedirectResponse = await session.handleIncomingRedirect({ restorePreviousSession: true, url: window.location.href });
        console.log({incomingRedirectResponse});
        this.store.authSession = session;
        this.store.podBase = await sessionPodBase( session );

        window.localStorage.removeItem("solid-auth-redirect-path");
        if( redirectPath ) {
          const url = new URL(redirectPath);
          const recognized = this.router.recognize( url.href.slice(url.origin.length) );
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

      window.localStorage.setItem("solid-auth-redirect-path", redirectUrl);

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
