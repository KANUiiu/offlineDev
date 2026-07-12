function greeting(name) {
    console.log(`Hey ${name}`);
}

if (typeof module !== 'undefined' && typeof module.exports === 'object') {
    module.exports = greeting;
}
