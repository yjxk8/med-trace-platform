/**
 * 医疗机构 services —— 契约唯一基准：后端变更说明-医疗机构-v1.md（2026-10-25）
 * ⚠️ SaaS 多租户根表（§一）：全生态按 code 引用机构，用户/配置的 miId 均指向本表
 * ⚠️ code 创建后锁定（§6.1）：修改接口传了也忽略——编辑 payload 类型层直接剔除（MiUpdateDTO）
 * ⚠️ 删除无复活（§一.2，与 mi-config 相反）：code/social_code 撞软删行同样拒绝 → 删除=永久作废，
 *   确认文案必须写明「永久无法再次使用」，禁止出现「可恢复」字样
 * ⚠️ socialCode 三态（§6.2）：不传=不改 / ""=清空(置NULL) / 值=改——R2 cleanPayload keepEmpty 豁免，
 *   全项目「空串转null」通用惯例对本字段失效
 * ⚠️ parentId 三态（§6.3）：编辑必须始终提交（0=移到顶级）；新增不传=顶级（0 不传）
 * ⚠️ status ≠ del_flag（§一.6）：2=关闭业务停用可恢复；del_flag=2 软删不可见不可恢复
 * ⚠️ tinyint(1)→Integer（§一.7）：出参 1/2 是数字非布尔，比较一律 String() 归一化
 * ⚠️ R3：page 契约 query 全可选（§二，mi-config 缺陷单后全项目统一口径），不注入 miId
 * ⚠️ 404/405 已分类（§二）：由请求封装统一 console.error 处理，本层不重复
 */
import { bizRequest } from '@/services/auth';
import type { IPage } from '@/utils/types'; // R1：唯一来源
import { cleanPayload } from '@/utils/payload'; // R2：唯一来源

// ===== 枚举（§四字段字典）=====
/** tenantType：1医院(默认) 2区域卫健委 */
export const MI_TENANT_TYPE = { HOSPITAL: '1', REGION: '2' } as const;
/** status：1正常 2关闭（业务停用可恢复；≠删除） */
export const MI_STATUS = { NORMAL: '1', CLOSED: '2' } as const;

/** §6.2：socialCode 是全工程唯一 keepEmpty 键——""=清空（后端置 NULL）；其余字段仍空串转 null */
const CLEAN_OPTS = { keepEmpty: ['socialCode'] } as const;

export type MiVO = {
  id: number;
  parentId: number; // 0=顶级医院
  tenantType: string | number; // 1医院 2区域卫健委
  name: string;
  code: string; // SaaS 唯一标识，创建后锁定
  orgType?: string | null;
  orgGrade?: string | null;
  coverPic?: string | null; // 【待补充 URL 约定】
  socialCode?: string | null; // 可空唯一；未填写=null（非空串）
  licenseNo?: string | null;
  province?: string | null;
  city?: string | null;
  county?: string | null;
  village?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  postCode?: string | null;
  headName?: string | null;
  phone?: string | null;
  telephone?: string | null;
  website?: string | null;
  mail?: string | null;
  status: string | number; // 1正常 2关闭
  remark?: string | null;
  createTime?: string;
  updateTime?: string | null;
  createBy?: number | null;
  updateBy?: number | null;
};

/** MiSaveDTO（§四）：新增 name/code 必填；tenantType/status 默认 1 */
export type MiSaveDTO = {
  id?: number; // PUT 必传（由 MiUpdateDTO 表达）
  parentId?: number; // 新增：不传=顶级；修改：恒提交（0=移到顶级）
  tenantType?: string;
  name: string;
  code?: string; // 新增必填；编辑锁定不传
  orgType?: string;
  orgGrade?: string;
  coverPic?: string;
  socialCode?: string; // 三态（§6.2），keepEmpty 豁免
  licenseNo?: string;
  province?: string;
  city?: string;
  county?: string;
  village?: string;
  street?: string;
  houseNumber?: string;
  postCode?: string;
  headName?: string;
  phone?: string;
  telephone?: string;
  website?: string;
  mail?: string;
  status?: string;
  remark?: string;
};

/** 修改入参：code 锁定（§6.1）——DTO 层剔除，双保险于后端忽略 */
export type MiUpdateDTO = Omit<MiSaveDTO, 'code'> & { id: number };

// ===== 扁平列表树工具（§6.3/§6.5 共享：MiParentSelect 与列表页复用）=====

/** 由扁平记录（排序 parentId→id 天然树序）构建索引：深度/下级判断/子树集合 */
export function buildMiIndex(records: MiVO[]) {
  const parentMap = new Map<number, number>();
  const childMap = new Map<number, Set<number>>();
  for (const r of records) {
    const p = Number(r.parentId ?? 0);
    parentMap.set(r.id, p);
    if (!childMap.has(p)) childMap.set(p, new Set());
    childMap.get(p)!.add(r.id);
  }
  return {
    parentMap,
    childMap,
    /** 深度（§6.5 缩进渲染）：沿父链上溯；祖先未在已加载数据中时按已得上溯层数兜底（分页下尽力而为） */
    depthOf(id: number): number {
      let depth = 0;
      let cur = parentMap.get(id);
      const seen = new Set<number>([id]); // 防脏数据成环
      while (cur != null && cur !== 0 && !seen.has(cur) && parentMap.has(cur)) {
        seen.add(cur);
        depth += 1;
        cur = parentMap.get(cur);
      }
      return depth;
    },
    /** 是否有「已加载」的下级（§6.4 删除禁用；跨页未加载的下级由后端 500 文案兜底） */
    hasChildren(id: number): boolean {
      return (childMap.get(id)?.size ?? 0) > 0;
    },
    /** 自身及全部子孙 id 集（§6.3 父级选择器禁选自身子树） */
    subtreeIds(id: number): Set<number> {
      const out = new Set<number>([id]);
      const stack = [id];
      while (stack.length) {
        const cur = stack.pop()!;
        childMap.get(cur)?.forEach((c) => {
          if (!out.has(c)) { out.add(c); stack.push(c); }
        });
      }
      return out;
    },
  };
}

// ===== 查询 =====

/** 分页（§三#1）：query 全可选 name(模糊)/code(模糊)/tenantType/status/city(精确)/county(精确)/parentId；
 *  固定排序 parentId→id 升序（天然树序），软删行不出现在列表 */
export function getMiPage(params: {
  name?: string;
  code?: string;
  tenantType?: string;
  status?: string;
  city?: string;
  county?: string;
  parentId?: number;
  page?: number;
  size?: number;
}): Promise<IPage<MiVO>> {
  return bizRequest<IPage<MiVO>>('/api/mi/page', { method: 'GET', params });
}

/** 详情（命中软删行 → 500「机构不存在，id=x」）；编辑回显主源，失败兜底行数据 */
export function getMiDetail(id: number): Promise<MiVO> {
  return bizRequest<MiVO>(`/api/mi/detail/${id}`);
}

// ===== 写操作 =====

/** 新增（§三#3）：name/code 必填；code 撞在用或软删行 → 500「机构代码已存在：{code}」（永久占用） */
export function createMi(data: MiSaveDTO): Promise<{ id: number; message: string }> {
  return bizRequest('/api/mi', { method: 'POST', data: cleanPayload(data, CLEAN_OPTS) });
}

/** 修改（§三#4）：code 锁定（类型层已剔除）；socialCode ""=清空（keepEmpty 直达）；null 不更新其余空字段 */
export function updateMi(data: MiUpdateDTO): Promise<{ message: string }> {
  return bizRequest('/api/mi', { method: 'PUT', data: cleanPayload(data, CLEAN_OPTS) });
}

/** 删除（软删但语义=永久作废 §一.2）：有在用下级 → 500「存在下级机构，请先删除下级机构」（前端已禁用，兜底） */
export function deleteMi(id: number): Promise<{ message: string }> {
  return bizRequest(`/api/mi/delete/${id}`, { method: 'DELETE' });
}

/** 启用(1)/关闭(2)；成功消息「已启用」/「已关闭」透传；关闭=业务停用可恢复（§一.6） */
export function setMiStatus(id: number, status: 1 | 2): Promise<{ message: string }> {
  return bizRequest(`/api/mi/${id}/status`, { method: 'PUT', params: { status } });
}
