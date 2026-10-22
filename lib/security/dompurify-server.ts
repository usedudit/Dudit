import createDOMPurify from "dompurify"
import { Window } from "happy-dom"
import type { WindowLike } from "dompurify"

const baseWindow = new Window({ url: "https://localhost" })
const nodePrototype = baseWindow.Node.prototype
const baseNodeNameGetter = Object.getOwnPropertyDescriptor(nodePrototype, "nodeName")?.get

if (baseNodeNameGetter) {
  Object.defineProperty(nodePrototype, "nodeName", {
    configurable: true,
    get() {
      let prototype = Object.getPrototypeOf(this)
      while (prototype && prototype !== nodePrototype) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, "nodeName")
        if (descriptor?.get) return descriptor.get.call(this)
        prototype = Object.getPrototypeOf(prototype)
      }
      return baseNodeNameGetter.call(this)
    },
  })
}

const document = baseWindow.document as unknown as Document

function createSnapshotNodeIterator(
  root: Node,
  whatToShow = -1,
  filter: NodeFilter | null = null,
) {
  const nodes: Node[] = []
  if (whatToShow & (1 << (root.nodeType - 1))) nodes.push(root)

  const walker = document.createTreeWalker(root, whatToShow, filter)
  let node = walker.nextNode()
  while (node) {
    nodes.push(node)
    node = walker.nextNode()
  }

  let index = 0
  return {
    nextNode: (): Node | null => (index < nodes.length ? nodes[index++] : null),
  }
}

Object.defineProperty(document, "createNodeIterator", {
  configurable: true,
  value: createSnapshotNodeIterator,
})

const windowLike = Object.create(baseWindow) as Window
Object.defineProperty(windowLike, "HTMLTemplateElement", {
  value: undefined,
  configurable: true,
})

const purify = createDOMPurify(windowLike as unknown as WindowLike)

export const sanitize = purify.sanitize.bind(purify)
export const addHook = purify.addHook.bind(purify)
export const removeHook = purify.removeHook.bind(purify)
export const removeHooks = purify.removeHooks.bind(purify)
export const removeAllHooks = purify.removeAllHooks.bind(purify)
export const setConfig = purify.setConfig.bind(purify)
export const clearConfig = purify.clearConfig.bind(purify)
export const isValidAttribute = purify.isValidAttribute.bind(purify)
export const isSupported = purify.isSupported
export const version = purify.version
export const removed = purify.removed

export default purify
