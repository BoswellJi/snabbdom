import { vnode, VNode, VNodeData } from "./vnode";
import * as is from "./is";

export type VNodes = VNode[];
export type VNodeChildElement = VNode | string | number | undefined | null;
export type ArrayOrElement<T> = T | T[];
export type VNodeChildren = ArrayOrElement<VNodeChildElement>;

function addNS(
  data: any,
  children: VNodes | undefined,
  sel: string | undefined
): void {
  data.ns = "http://www.w3.org/2000/svg";
  if (sel !== "foreignObject" && children !== undefined) {
    for (let i = 0; i < children.length; ++i) {
      const childData = children[i].data;
      if (childData !== undefined) {
        addNS(childData, children[i].children as VNodes, children[i].sel);
      }
    }
  }
}

export function h(sel: string): VNode;
export function h(sel: string, data: VNodeData | null): VNode;
export function h(sel: string, children: VNodeChildren): VNode;
export function h(
  sel: string,
  data: VNodeData | null,
  children: VNodeChildren // 数组 或者 字符串（文本节点
): VNode;
export function h(sel: any, b?: any, c?: any): VNode {
  let data: VNodeData = {};
  let children: any;
  let text: any;
  let i: number;
  // 存在子节点
  if (c !== undefined) {

    // b为data
    if (b !== null) {
      data = b;
    }

    // c为子节点
    if (is.array(c)) {
      children = c;

      // c为文本节点
    } else if (is.primitive(c)) {
      text = c;

      // c为vnode
    } else if (c && c.sel) {
      children = [c];
    }

    // b存在
  } else if (b !== undefined && b !== null) {

    // b为子节点数组
    if (is.array(b)) {
      children = b;

      // b为文本节点
    } else if (is.primitive(b)) {
      text = b;

      // b为vnode
    } else if (b && b.sel) {
      children = [b];

      // b为data
    } else {
      data = b;
    }
  }

  // 子节点存在
  if (children !== undefined) {
    for (i = 0; i < children.length; ++i) {
      if (is.primitive(children[i]))

      // 子节点为文本或者数字，创建一个文本节点的vnode
        children[i] = vnode(
          undefined,
          undefined,
          undefined,
          children[i],
          undefined
        );
    }
  }

  // svg元素
  if (
    sel[0] === "s" &&
    sel[1] === "v" &&
    sel[2] === "g" &&
    (sel.length === 3 || sel[3] === "." || sel[3] === "#")
  ) {
    addNS(data, children, sel);
  }

  // 创建容器节点的vnode
  return vnode(sel, data, children, text, undefined);
}
