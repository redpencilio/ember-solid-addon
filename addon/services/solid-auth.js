import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import Service from '@ember/service';
import { getDefaultSession } from '@inrupt/solid-client-authn-browser';
import rdflib from 'rdflib';
import { LDP, RDF, SOLID, SP } from '../utils/namespaces';
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
    if (this.session) {
      return this.session;
    } else {
      const session = getDefaultSession();

      try {
        const redirectPath = window.localStorage.getItem(this.solidAuthRedirectPathKey);
        if( !redirectPath )
          window.localStorage.setItem(this.solidAuthRedirectPathKey, window.location.href);

        const incomingRedirectResponse = await session.handleIncomingRedirect({ restorePreviousSession: true, url: window.location.href });
        console.log({incomingRedirectResponse});
        this.store.authSession = session;
        this.store.podBase = await this.getPodBase(session.info.webId);

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
      this.store.podBase = await this.getPodBase(session.info.webId);
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
      || sym(`${this.podBase}/settings}/privateTypeIndex`);
  }

  get publicTypeIndexLocation() {
    return this.store.any(this.webIdSym, SOLID("publicTypeIndex"), undefined, this.webIdSym.doc())
      || sym(`${this.podBase}/settings}/publicTypeIndex`);
  }

  get webId() {
    return this.session?.info?.webId;
  }

  get webIdSym() {
    return sym(this.webId);
  }

  /**
   * Gets the pod base of the current user as a Promise.
   * Will always end with a trailing slash.
   *
   * First, it will look for a pim:storage property on the webId.
   * If not, it will look if the current queried resource is a pim:Storage resource, which is then our podBase.
   * If not, it will look if the current queried resource is a lpd:BasicContainer resource, which is then our podBase.
   * Otherwise, it will traverse upwards and do the same again.
   *
   * @returns {Promise<string>}
   */
  get podBase() {
    return this.getPodBase(this.webId);
  }

  async getPodBase(webId) {
    let podBase = undefined;
    let webIdDoc = webId;
    if (webId) {
      await this.store.load(sym(webId).doc());

      // Start with WebID and traverse upwards until we find a pim:Storage resource or a pim:Storage link response header.
      let previousWebIdDoc = webIdDoc;
      while (!podBase && !this.store.any(webIdDoc, RDF("type"), LDP("BasicContainer"), sym(webIdDoc).doc()) && !webIdDoc.endsWith("://")) {
        // Check if the current resource is a pim:Storage resource
        podBase = this.store.any(sym(webIdDoc), SP("storage"), undefined, sym(webIdDoc).doc())?.value || this.store.any(undefined, RDF("type"), SP("Storage"), sym(webIdDoc).doc())?.value;

        // Otherwise, check if the current resource has a pim:Storage link response header.
        if (!podBase) {
          // Get response headers from the webIdDoc
          const response = await fetch(webIdDoc, { method: 'HEAD' });
          const linkHeader = response.headers.get('Link');
          if (
            linkHeader &&
            linkHeader.includes('http://www.w3.org/ns/pim/space#Storage')
          ) {
            podBase = webIdDoc;
          }
        }

        // Otherwise, traverse upwards
        if (!podBase) {
          // Prepare next iteration
          previousWebIdDoc = webIdDoc;
          webIdDoc = webIdDoc.substring(0, webIdDoc.lastIndexOf("/", webIdDoc.length - 2)) + "/";
        }
      }

      if (!podBase) {
        podBase = previousWebIdDoc;
      }
      if (!podBase.endsWith('/')) {
        podBase += '/';
      }
    } else {
      console.log('No webId');
    }
    return podBase;
  }
}
