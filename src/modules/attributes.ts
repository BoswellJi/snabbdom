import { VNode, VNodeData } from "../vnode";
import { Module } from "./module";

export type Attrs = Record<string, string | number | boolean>;

const xlinkNS = "http://www.w3.org/1999/xlink";
const xmlNS = "http://www.w3.org/XML/1998/namespace";
const colonChar = 58;
const xChar = 120;

function updateAttrs(oldVnode: VNode, vnode: VNode): void {
  let key: string;
  // 获取vnode的dom对象
  const elm: Element = vnode.elm as Element;
  // 获取oldVnode中data的attrs属性
  let oldAttrs = (oldVnode.data as VNodeData).attrs;
  // 获取newVnode中data的attrs属性
  let attrs = (vnode.data as VNodeData).attrs;

  // 两个节点的属性都不存在
  if (!oldAttrs && !attrs) return;
  // 两个节点的属性都相等
  if (oldAttrs === attrs) return;
  
  oldAttrs = oldAttrs || {};
  attrs = attrs || {};

  // update modified attributes, add new attributes
  for (key in attrs) {
    // 获取节点属性
    const cur = attrs[key];
    // 获取老节点属性
    const old = oldAttrs[key];
    // 不相等
    if (old !== cur) {
      // 删除与添加
      if (cur === true) {
        elm.setAttribute(key, "");
      } else if (cur === false) {
        elm.removeAttribute(key);
      } else {
        if (key.charCodeAt(0) !== xChar) {
          elm.setAttribute(key, cur as any);
        } else if (key.charCodeAt(3) === colonChar) {
          // Assume xml namespace
          elm.setAttributeNS(xmlNS, key, cur as any);
        } else if (key.charCodeAt(5) === colonChar) {
          // Assume xlink namespace
          elm.setAttributeNS(xlinkNS, key, cur as any);
        } else {
          elm.setAttribute(key, cur as any);
        }
      }
    }
  }
  // remove removed attributes
  // use `in` operator since the previous `for` iteration uses it (.i.e. add even attributes with undefined value)
  // the other option is to remove all attributes with value == undefined
  for (key in oldAttrs) {
    if (!(key in attrs)) {
      elm.removeAttribute(key);
    }
  }
}

export const attributesModule: Module = {
  create: updateAttrs,
  update: updateAttrs,
};
