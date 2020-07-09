function included() {
    this._super.included.apply(this, arguments);
    this.import('node_modules/solid-auth-client/bin/solid-auth-client.js');
}