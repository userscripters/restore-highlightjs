// ==UserScript==
// @name         Restore highlight.js
// @namespace    userscripters
// @version      1.1.0
// @author       double-beep
// @contributor  Scratte
// @description  Restore highlight.js functionality on revisions and review, since it's removed: https://meta.stackoverflow.com/a/408993
// @license      GPL-3.0

// @include      /^https://[^/]+\.stackexchange\.com/(review\/suggested-edits|posts\/\d*\/revisions$)/
// @include      /^https://([^/]*\.)?stackoverflow\.com/(review\/suggested-edits|posts\/\d*\/revisions$)/
// @include      /^https://(meta\.)?superuser\.com/(review\/suggested-edits|posts\/\d*\/revisions$)/
// @include      /^https://(meta\.)?serverfault\.com/(review\/suggested-edits|posts\/\d*\/revisions$)/
// @include      /^https://(meta\.)?askubuntu\.com/(review\/suggested-edits|posts\/\d*\/revisions$)/
// @include      /^https://(meta\.)?mathoverflow\.net/(review\/suggested-edits|posts\/\d*\/revisions$)/
// @include      /^https://stackapps\.com/(review\/suggested-edits|posts\/\d*\/revisions$)/
// @run-at       document-start
// @grant        none

// @updateURL    https://raw.githubusercontent.com/userscripters/restore-highlightjs/master/restore_highlightjs.user.js
// @downloadURL  https://raw.githubusercontent.com/userscripters/restore-highlightjs/master/restore_highlightjs.user.js
// @homepageURL  https://github.com/userscripters/restore-highlightjs
// @supportURL   https://github.com/userscripters/restore-highlightjs/issues
// ==/UserScript==
/* globals hljs */

(function() {
    'use strict';

    const reviewRequestRegex = /\/review\/(next-task|task-reviewed)/;
    const revisionsRequestRegex = /revisions\/\d+\//; // when loading a revision's body

    /* start of copied code */
    // This code has been copied from this GitHub issue https://github.com/highlightjs/highlight.js/issues/2889
    // It is written by joshgoebel. I have removed all the comments and formatted it using 4 spaces instead of 2
    // According to him in this comment https://github.com/highlightjs/highlight.js/issues/2889#issuecomment-862483141, it no longer works
    // after a recent change. After following the advice in the same comment, I came up with the following class implementation
    class MergeHtmlPlugin {
        'before:highlightElement' ({ el }) {
            this.originalStream = nodeStream(el);
        }
        'after:highlightElement' ({ el, result, text }) {
            const resultNode = document.createElement('div');
            resultNode.innerHTML = result.value;
            el.innerHTML = mergeStreams(this.originalStream, nodeStream(resultNode), text);
        }
    }

    function escapeHTML(value) {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }

    function tag(node) {
        return node.nodeName.toLowerCase();
    }

    function nodeStream(node) {
        const result = [];
        (function _nodeStream(node, offset) {
            for (let child = node.firstChild; child; child = child.nextSibling) {
                if (child.nodeType === 3) {
                    // eslint-disable-next-line no-param-reassign
                    offset += child.nodeValue.length;
                } else if (child.nodeType === 1) {
                    result.push({
                        event: 'start',
                        offset: offset,
                        node: child
                    });
                    // eslint-disable-next-line no-param-reassign
                    offset = _nodeStream(child, offset);
                    if (!tag(child).match(/br|hr|img|input/)) {
                        result.push({
                            event: 'stop',
                            offset: offset,
                            node: child
                        });
                    }
                }
            }
            return offset;
        })(node, 0);
        return result;
    }

    function mergeStreams(original, highlighted, value) {
        let processed = 0;
        let result = '';
        const nodeStack = [];

        function selectStream() {
            if (!original.length || !highlighted.length) {
                return original.length ? original : highlighted;
            }
            if (original[0].offset !== highlighted[0].offset) {
                return (original[0].offset < highlighted[0].offset) ? original : highlighted;
            }

            return highlighted[0].event === 'start' ? original : highlighted;
        }

        function open(node) {
            function attributeString(attr) {
                return ' ' + attr.nodeName + '="' + escapeHTML(attr.value) + '"';
            }
            result += '<' + tag(node) + [].map.call(node.attributes, attributeString).join('') + '>';
        }

        function close(node) {
            result += '</' + tag(node) + '>';
        }

        function render(event) {
            (event.event === 'start' ? open : close)(event.node);
        }

        while (original.length || highlighted.length) {
            let stream = selectStream();
            result += escapeHTML(value.substring(processed, stream[0].offset));
            processed = stream[0].offset;
            if (stream === original) {
                nodeStack.reverse().forEach(close);
                do {
                    render(stream.splice(0, 1)[0]);
                    stream = selectStream();
                } while (stream === original && stream.length && stream[0].offset === processed);
                nodeStack.reverse().forEach(open);
            } else {
                if (stream[0].event === 'start') {
                    nodeStack.push(stream[0].node);
                } else {
                    nodeStack.pop();
                }
                render(stream.splice(0, 1)[0]);
            }
        }
        return result + escapeHTML(value.substr(processed));
    }
    /* end of copied code */

    async function getPreferredLang() {
        const tags = [...document.querySelectorAll('.post-tag')]
            .filter(tag => !tag.firstElementChild?.classList?.contains('diff-delete'))
            .map(tag => tag.innerText);
        if (!tags.length) return;

        const request = await fetch(`/api/tags/langdiv?tags=${tags.join(' ')}`);
        const response = await request.text();
        const parsedElement = new DOMParser().parseFromString(response, 'text/html');
        const preferredLang = parsedElement.body.querySelector('div').innerText;

        return preferredLang;
    }

    async function highlightCodeBlocks() {
        const isOnReviews = location.href.includes('/review/');
        // on reviews, we must fetch the preferred language
        const preferredLang = await getPreferredLang();

        // adapted from full.en.js so as to not rely on SE
        [...document.querySelectorAll('.js-post-body pre code, .js-wmd-preview pre code')].map(element => element.parentElement).forEach(element => {
            const classes = {
                highlight: 's-code-block',
                override: 'prettyprint-override',
                preferred: isOnReviews ? preferredLang : document.querySelector('#js-codeblock-lang')?.innerText || ''
            };

            if (element.classList.contains(classes.override)) {
                element.classList.remove(classes.override);
                element.classList.add(classes.override);
            }

            if (!element.classList.contains(classes.highlight) && classes.preferred) {
                element.classList.add(classes.highlight, classes.preferred);
            }
        });

        // This is what SE uses in full.en.js
        document.querySelectorAll('pre.s-code-block code:not(.hljs)').forEach(element => hljs.highlightElement(element));
    }

    // load the library's JS
    const script = document.createElement('script');
    script.src = 'https://cdn.sstatic.net/Js/highlightjs-loader.en.js';
    script.addEventListener('load', () => {
        hljs.addPlugin(new MergeHtmlPlugin());
        hljs.configure({
            cssSelector: 'pre > code:not(.hljs)', // avoid highlighting already highlighted code blocks
            ignoreUnescapedHTML: true // disable warnings about unescaped HTML, requested by Scratte: https://chat.stackoverflow.com/transcript/message/53028641
        });
        highlightCodeBlocks();
    });
    document.head.appendChild(script);

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function() {
        this.addEventListener('load', function() {
            if (!reviewRequestRegex.test(this.responseURL) && !revisionsRequestRegex.test(this.responseURL)) return;
            highlightCodeBlocks();
        });
        originalOpen.apply(this, arguments);
    };
})();
