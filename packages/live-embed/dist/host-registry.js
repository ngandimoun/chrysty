let registrar = null;
export function setHostRegistrar(next) {
    registrar = next;
}
export function registerHostContext(token, value) {
    if (!registrar)
        return () => undefined;
    return registrar(token, value);
}
