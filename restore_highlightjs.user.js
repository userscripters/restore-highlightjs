// ==UserScript==
// @name         Restore highlight.js
// @namespace    userscripters
// @version      1.0.0
// @author       double-beep
// @description  Restore highlight.js functionality on revisions and review, since it's removed: https://meta.stackoverflow.com/a/408993
// @match        *://*.stackexchange.com/*
// @match        *://*.stackoverflow.com/*
// @match        *://*.superuser.com/*
// @match        *://*.serverfault.com/*
// @match        *://*.askubuntu.com/*
// @match        *://*.stackapps.com/*
// @match        *://*.mathoverflow.net/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/userscripters/restore-highlightjs/master/restore_highlightjs.user.js
// @downloadURL  https://raw.githubusercontent.com/userscripters/restore-highlightjs/master/restore_highlightjs.user.js
// ==/UserScript==
/* globals hljs */

(function() {
    'use strict';

    const reviewRequestRegex = /\/review\/(next-task|task-reviewed)/;
    const revisionsRequestRegex = /revisions\/\d+\//; // when loading a revision's body
    const onRevisionsPage = /posts\/\d*\/revisions$/.test(window.location.href);
    const onReviewSuggestedEditPage = /review\/suggested-edits/.test(window.location.href);

    if (!onRevisionsPage && !onReviewSuggestedEditPage) return; // page has not highlight.js disabled

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
                    // Prevent void elements from having an end tag that would actually
                    // double them in the output. There are more void elements in HTML
                    // but we list only those realistically expected in code display.
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

    function highlightCodeBlocks() {
        // This is what SE uses in full.en.js
        // document.querySelectorAll('pre.s-code-block code:not(.hljs)').forEach(element => hljs.highlightElement(element));
        hljs.highlightAll(); // we'll use this because why not
    }

    // load the library's JS
    const script = document.createElement('script');
    script.src = 'https://cdn.sstatic.net/Js/highlightjs-loader.en.js';
    script.addEventListener('load', () => {
        hljs.addPlugin(new MergeHtmlPlugin());
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