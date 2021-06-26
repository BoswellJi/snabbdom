import { Module } from "./modules/module";
import { vnode, VNode } from "./vnode";
import * as is from "./is";
import { htmlDomApi, DOMAPI } from "./htmldomapi";

type NonUndefined<T> = T extends undefined ? never : T;

function isUndef(s: any): boolean {
  return s === undefined;
}
function isDef<A>(s: A): s is NonUndefined<A> {
  return s !== undefined;
}

type VNodeQueue = VNode[];

const emptyNode = vnode("", {}, [], undefined, undefined);

function sameVnode(vnode1: VNode, vnode2: VNode): boolean {
  const isSameKey = vnode1.key === vnode2.key;
  const isSameIs = vnode1.data?.is === vnode2.data?.is;
  const isSameSel = vnode1.sel === vnode2.sel;

  // 选择器，key，is
  return isSameSel && isSameKey && isSameIs;
}

function isVnode(vnode: any): vnode is VNode {
  return vnode.sel !== undefined;
}

type KeyToIndexMap = { [key: string]: number };

type ArraysOf<T> = {
  [K in keyof T]: Array<T[K]>;
};

type ModuleHooks = ArraysOf<Required<Module>>;

function createKeyToOldIdx(
  children: VNode[],
  beginIdx: number,
  endIdx: number
): KeyToIndexMap {
  const map: KeyToIndexMap = {};
  for (let i = beginIdx; i <= endIdx; ++i) {
    // 获取节点的key
    const key = children[i]?.key;
    if (key !== undefined) {
      map[key as string] = i;
    }
  }
  return map;
}

const hooks: Array<keyof Module> = [
  "create",
  "update",
  "remove",
  "destroy",
  "pre",
  "post",
];

export function init(modules: Array<Partial<Module>>, domApi?: DOMAPI) {
  let i: number;
  let j: number;

  // 这里存放处理data的不同模块
  const cbs: ModuleHooks = {
    create: [],
    update: [],
    remove: [],
    destroy: [],
    pre: [],
    post: [],
  };

  const api: DOMAPI = domApi !== undefined ? domApi : htmlDomApi;
  
  // 遍历处理hooks name, 这里主要用来收集操作vnode的data的钩子函数
  for (i = 0; i < hooks.length; ++i) {
    // 获取定义好的回调函数数组
    cbs[hooks[i]] = [];
    // 编译注册的模块
    for (j = 0; j < modules.length; ++j) {
      // 获取模块中的声明周期函数
      const hook = modules[j][hooks[i]];
      if (hook !== undefined) {
        // 存放到回调中
        (cbs[hooks[i]] as any[]).push(hook);
      }
    }
  }

  function emptyNodeAt(elm: Element) {
    const id = elm.id ? "#" + elm.id : "";

    // elm.className doesn't return a string when elm is an SVG element inside a shadowRoot.
    // https://stackoverflow.com/questions/29454340/detecting-classname-of-svganimatedstring
    const classes = elm.getAttribute("class");

    const c = classes ? "." + classes.split(" ").join(".") : "";
    return vnode(
      api.tagName(elm).toLowerCase() + id + c,
      {},
      [],
      undefined,
      elm
    );
  }

  function createRmCb(childElm: Node, listeners: number) {
    return function rmCb() {
      if (--listeners === 0) {
        const parent = api.parentNode(childElm) as Node;
        api.removeChild(parent, childElm);
      }
    };
  }

  function createElm(vnode: VNode, insertedVnodeQueue: VNodeQueue): Node {
    let i: any;
    // 处理data
    let data = vnode.data;
    if (data !== undefined) {
      const init = data.hook?.init;
      if (isDef(init)) {
        init(vnode);
        data = vnode.data;
      }
    }
    const children = vnode.children;
    const sel = vnode.sel;
    // 选择器是否为!
    if (sel === "!") {
      if (isUndef(vnode.text)) {
        vnode.text = "";
      }
      // 创建注释
      vnode.elm = api.createComment(vnode.text!);
    } else if (sel !== undefined) {
      // Parse selector
      const hashIdx = sel.indexOf("#");
      const dotIdx = sel.indexOf(".", hashIdx);
      const hash = hashIdx > 0 ? hashIdx : sel.length;
      const dot = dotIdx > 0 ? dotIdx : sel.length;
      const tag =
        hashIdx !== -1 || dotIdx !== -1
          ? sel.slice(0, Math.min(hash, dot))
          : sel;
        // 创建元素
      const elm = (vnode.elm =
        isDef(data) && isDef((i = data.ns))
          ? api.createElementNS(i, tag, data)
          : api.createElement(tag, data));
      if (hash < dot) elm.setAttribute("id", sel.slice(hash + 1, dot));
      if (dotIdx > 0)
        elm.setAttribute("class", sel.slice(dot + 1).replace(/\./g, " "));
        // 元素创建后执行data的创建操作
      for (i = 0; i < cbs.create.length; ++i) cbs.create[i](emptyNode, vnode);
      // 这里将真实dom插入容器中
      if (is.array(children)) {
        for (i = 0; i < children.length; ++i) {
          const ch = children[i];
          if (ch != null) {
            api.appendChild(elm, createElm(ch as VNode, insertedVnodeQueue));
          }
        }
      } else if (is.primitive(vnode.text)) {
        api.appendChild(elm, api.createTextNode(vnode.text));
      }
      // 调用vnode data的create,insert函数
      const hook = vnode.data!.hook;
      if (isDef(hook)) {
        hook.create?.(emptyNode, vnode);

        // newVnode存在insert hook,保存起来
        if (hook.insert) {
          insertedVnodeQueue.push(vnode);
        }
      }
    } else {
      vnode.elm = api.createTextNode(vnode.text!);
    }
    return vnode.elm;
  }

  /***
   * 添加新的vnode
   */
  function addVnodes(
    parentElm: Node,
    before: Node | null,
    vnodes: VNode[],
    startIdx: number,
    endIdx: number,
    insertedVnodeQueue: VNodeQueue
  ) {
    // 将vnode创建为真实dom，插入到页面中
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx];
      if (ch != null) {
        api.insertBefore(parentElm, createElm(ch, insertedVnodeQueue), before);
      }
    }
  }

  /***
   * 销毁vnode
   */
  function invokeDestroyHook(vnode: VNode) {
    // 获取vnode data
    const data = vnode.data;
    
    if (data !== undefined) {
      // 调用vnode的destroy函数
      data?.hook?.destroy?.(vnode);
      // 执行data的销毁操作
      for (let i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode);
      // 遍历子vnode递归销毁
      if (vnode.children !== undefined) {
        for (let j = 0; j < vnode.children.length; ++j) {
          const child = vnode.children[j];
          if (child != null && typeof child !== "string") {
            invokeDestroyHook(child);
          }
        }
      }
    }
  }


  /***
   * 删除vnode
   */
  function removeVnodes(
    parentElm: Node,
    vnodes: VNode[],
    startIdx: number,
    endIdx: number
  ): void {
    // 
    for (; startIdx <= endIdx; ++startIdx) {
      let listeners: number;
      let rm: () => void;
      
      const ch = vnodes[startIdx];
      if (ch != null) {
        if (isDef(ch.sel)) {
          // 销毁vnode
          invokeDestroyHook(ch);
          // 执行data的删除操作
          listeners = cbs.remove.length + 1;
          rm = createRmCb(ch.elm!, listeners);
          for (let i = 0; i < cbs.remove.length; ++i) cbs.remove[i](ch, rm);
          // vnode的remove hook
          const removeHook = ch?.data?.hook?.remove;
          // 执行
          if (isDef(removeHook)) {
            removeHook(ch, rm);
          } else {
            rm();
          }
        } else {
          // Text node
          api.removeChild(parentElm, ch.elm!);
        }
      }
    }
  }

  /***
   * 这里是diff， 双双指针
   *
   * v-for的遍历的key，不要使用index,
   * 1. 因为在反转数组的时候会有问题
   * 2. 删除节点的时候会有问题
   */
  function updateChildren(
    parentElm: Node,
    oldCh: VNode[],
    newCh: VNode[],
    insertedVnodeQueue: VNodeQueue
  ) {
    let oldStartIdx = 0;
    let newStartIdx = 0;

    let oldEndIdx = oldCh.length - 1;
    let oldStartVnode = oldCh[0];
    let oldEndVnode = oldCh[oldEndIdx];

    let newEndIdx = newCh.length - 1;
    let newStartVnode = newCh[0];
    let newEndVnode = newCh[newEndIdx];

    let oldKeyToIdx: KeyToIndexMap | undefined;
    let idxInOld: number;
    let elmToMove: VNode;
    let before: any;

    // 这里比较的目的是为了找到可复用的vnode，也就是用于相同key的vnode
    // oldVnode开始索引小于oldVnode结束索引 && newVnode开始索引小于newVnode结束索引
    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      // 左oldVnode不存在，向前进一位
      if (oldStartVnode == null) {
        oldStartVnode = oldCh[++oldStartIdx]; // Vnode might have been moved left

        // 右oldVnode不存在，向后退一位
      } else if (oldEndVnode == null) {
        oldEndVnode = oldCh[--oldEndIdx];

        // 左newVnode不存在，向前进一位
      } else if (newStartVnode == null) {
        newStartVnode = newCh[++newStartIdx];

        // 右newVnode不存在，向后退一位
      } else if (newEndVnode == null) {
        newEndVnode = newCh[--newEndIdx];

        // 左oldVnode和newVnode相同，都向前进一位
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue);
        oldStartVnode = oldCh[++oldStartIdx];
        newStartVnode = newCh[++newStartIdx];

        // 右oldVnode和newVnode相同，都向后退一位
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue);
        oldEndVnode = oldCh[--oldEndIdx];
        newEndVnode = newCh[--newEndIdx];

        // 左oldVnode和右newVnode相同，右oldVnode退一步，左newVnode进一步
      } else if (sameVnode(oldStartVnode, newEndVnode)) {
        // Vnode moved right
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue);
        api.insertBefore(
          parentElm,
          oldStartVnode.elm!,
          api.nextSibling(oldEndVnode.elm!)
        );
        oldStartVnode = oldCh[++oldStartIdx];
        newEndVnode = newCh[--newEndIdx];

        // 右oldVnode和左newVnode相同，右oldVnode退一步，左newVnode进一步
      } else if (sameVnode(oldEndVnode, newStartVnode)) {
        // Vnode moved left
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue);
        api.insertBefore(parentElm, oldEndVnode.elm!, oldStartVnode.elm!);
        oldEndVnode = oldCh[--oldEndIdx];
        newStartVnode = newCh[++newStartIdx];

        // 左newVnode节点进一步
      } else {
        if (oldKeyToIdx === undefined) {
          oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx);
        }
        idxInOld = oldKeyToIdx[newStartVnode.key as string];
        if (isUndef(idxInOld)) {
          // New element
          api.insertBefore(
            parentElm,
            createElm(newStartVnode, insertedVnodeQueue),
            oldStartVnode.elm!
          );
        } else {
          elmToMove = oldCh[idxInOld];
          if (elmToMove.sel !== newStartVnode.sel) {
            api.insertBefore(
              parentElm,
              createElm(newStartVnode, insertedVnodeQueue),
              oldStartVnode.elm!
            );
          } else {
            // 找到可复用节点
            patchVnode(elmToMove, newStartVnode, insertedVnodeQueue);
            oldCh[idxInOld] = undefined as any;
            api.insertBefore(parentElm, elmToMove.elm!, oldStartVnode.elm!);
          }
        }
        newStartVnode = newCh[++newStartIdx];
      }
    }

    // 左oldVnode索引小于右oldVnode索引 || 左newVnode索引小于右newVnode索引
    if (oldStartIdx <= oldEndIdx || newStartIdx <= newEndIdx) {
      if (oldStartIdx > oldEndIdx) {
        before = newCh[newEndIdx + 1] == null ? null : newCh[newEndIdx + 1].elm;
        addVnodes(
          parentElm,
          before,
          newCh,
          newStartIdx,
          newEndIdx,
          insertedVnodeQueue
        );
      } else {
        removeVnodes(parentElm, oldCh, oldStartIdx, oldEndIdx);
      }
    }
  }

  /***
   * 获取补丁对象,
   * 在oldVnode中找到可复用的节点才会调用这个方法
   */
  function patchVnode(
    oldVnode: VNode,
    vnode: VNode,
    insertedVnodeQueue: VNodeQueue
  ) {
    // vnode hook
    const hook = vnode.data?.hook;
    // 调用vnode prepatch hook
    hook?.prepatch?.(oldVnode, vnode);
    // 获取vnode dom对象
    const elm = (vnode.elm = oldVnode.elm)!;
    // oldVnode子节点
    const oldCh = oldVnode.children as VNode[];
    // newVnode子节点
    const ch = vnode.children as VNode[];
    // 新老节点相同，不需要补丁，直接返回
    if (oldVnode === vnode) return;

    // 节点存在data
    if (vnode.data !== undefined) {
      // 调用cbs处理vnode对应的data的update操作
      for (let i = 0; i < cbs.update.length; ++i)
        cbs.update[i](oldVnode, vnode);
      vnode.data.hook?.update?.(oldVnode, vnode);
    }
    // newVnode非文本节点
    if (isUndef(vnode.text)) {

      // 新老子节点都在
      if (isDef(oldCh) && isDef(ch)) {
        // diff
        if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue);

         // 这里说明新节点在，老节点不在
      } else if (isDef(ch)) {

        if (isDef(oldVnode.text)) api.setTextContent(elm, "");
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue);

        // 这里是老节点在，新节点不在
      } else if (isDef(oldCh)) {
        removeVnodes(elm, oldCh, 0, oldCh.length - 1);

         // oldVnode是文本节点
      } else if (isDef(oldVnode.text)) {
        api.setTextContent(elm, "");
      }


      // newVnode是文本节点，还与oldVnode的不同
    } else if (oldVnode.text !== vnode.text) {

      // oldVnode存在
      if (isDef(oldCh)) {
        removeVnodes(elm, oldCh, 0, oldCh.length - 1);
      }
      api.setTextContent(elm, vnode.text!);
    }

    // 调用vnode postpatch hook
    hook?.postpatch?.(oldVnode, vnode);
  }

  return function patch(oldVnode: VNode | Element, vnode: VNode): VNode {
    let i: number, elm: Node, parent: Node;
    const insertedVnodeQueue: VNodeQueue = [];
    // data处理之前
    for (i = 0; i < cbs.pre.length; ++i) cbs.pre[i]();

    // oldVnode是否是vnode
    if (!isVnode(oldVnode)) {
      oldVnode = emptyNodeAt(oldVnode);
    } 

    // oldVnode newVnode是否相同，这种情况下会进一步对比子vnode
    if (sameVnode(oldVnode, vnode)) {
      patchVnode(oldVnode, vnode, insertedVnodeQueue);
    } else {
      // 直接创建newVnode替换oldVnode
      elm = oldVnode.elm!;
      parent = api.parentNode(elm) as Node;

      createElm(vnode, insertedVnodeQueue);

      if (parent !== null) {
        api.insertBefore(parent, vnode.elm!, api.nextSibling(elm));
        removeVnodes(parent, [oldVnode], 0, 0);
      }
    }

    for (i = 0; i < insertedVnodeQueue.length; ++i) {
      insertedVnodeQueue[i].data!.hook!.insert!(insertedVnodeQueue[i]);
    }
    // data处理之后
    for (i = 0; i < cbs.post.length; ++i) cbs.post[i]();
    return vnode;
  };
}
