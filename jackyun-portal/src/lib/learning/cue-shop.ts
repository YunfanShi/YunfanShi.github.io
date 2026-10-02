import { dateKey, type CueReview, type LearningStatus } from './schedule-control.ts';
export type CueShopCategory = 'effect' | 'theme' | 'title' | 'frame';
export type CueShopItem = {
    id: string;
    name: string;
    category: CueShopCategory;
    level: number;
    stars: number;
    xp: number;
    description: string;
    value: string | number;
};
export const CUE_SHOP_ITEMS: CueShopItem[] = [
    { id: 'effect-solar', name: '日冕爆发', category: 'effect', level: 2, stars: 18, xp: 0, value: 3, description: '金色日冕层层扩散，释放细长光芒。' },
    { id: 'effect-warp', name: '曲速跃迁', category: 'effect', level: 4, stars: 48, xp: 0, value: 4, description: '从深空穿越星轨，汇入明亮星核。' },
    { id: 'effect-ribbon', name: '星云织光', category: 'effect', level: 6, stars: 0, xp: 220, value: 5, description: '交织的光带收拢后，绽放成星云。' },
    { id: 'effect-binary', name: '双星共舞', category: 'effect', level: 8, stars: 120, xp: 0, value: 6, description: '两颗星核沿轨道汇聚，再向远方释放。' },
    { id: 'effect-prism', name: '棱镜星阵', category: 'effect', level: 10, stars: 180, xp: 0, value: 7, description: '晶体星阵与细密折射光束。' },
    { id: 'effect-galaxy', name: '银河回响', category: 'effect', level: 15, stars: 260, xp: 0, value: 8, description: '多重旋臂在宽阔星场中展开。' },
    { id: 'theme-ice', name: '冰蓝远空', category: 'theme', level: 1, stars: 9, xp: 0, value: 'ice', description: '冷蓝星尘与清澈的银色星核。' },
    { id: 'theme-violet', name: '紫晶星云', category: 'theme', level: 3, stars: 28, xp: 0, value: 'violet', description: '紫晶薄雾笼罩旋臂，三种状态星仍清晰。' },
    { id: 'theme-rose', name: '玫瑰深空', category: 'theme', level: 5, stars: 60, xp: 0, value: 'rose', description: '柔和玫瑰色星云，低亮度背景。' },
    { id: 'theme-amber', name: '琥珀银河', category: 'theme', level: 9, stars: 140, xp: 0, value: 'amber', description: '温暖星尘与琥珀色银河核心。' },
    { id: 'title-first', name: '初见星光', category: 'title', level: 1, stars: 6, xp: 0, value: '初见星光', description: '侧栏称号，献给持续开始的你。' },
    { id: 'title-explorer', name: '星际探索者', category: 'title', level: 2, stars: 0, xp: 80, value: '星际探索者', description: '用可用 XP 兑换；累计等级经验继续保留。' },
    { id: 'title-navigator', name: '星海领航员', category: 'title', level: 5, stars: 0, xp: 260, value: '星海领航员', description: '星海旅程的进阶称号。' },
    { id: 'title-keeper', name: '星空收藏家', category: 'title', level: 10, stars: 0, xp: 600, value: '星空收藏家', description: '为越来越丰富的收藏点亮名字。' },
    { id: 'title-voyager', name: '银河远征者', category: 'title', level: 18, stars: 0, xp: 1200, value: '银河远征者', description: '长程学习的珍藏称号。' },
    { id: 'frame-orbit', name: '银环仪表', category: 'frame', level: 2, stars: 12, xp: 0, value: 'orbit', description: '侧栏带细银环与角落标记。' },
    { id: 'frame-prism', name: '紫晶舷窗', category: 'frame', level: 4, stars: 35, xp: 0, value: 'prism', description: '紫晶边缘与渐变舷窗。' },
    { id: 'frame-solar', name: '日耀舰桥', category: 'frame', level: 8, stars: 0, xp: 420, value: 'solar', description: '温暖金色的舰桥仪表框。' },
];
export type CueGameEarning = {
    id: string;
    at: string;
    stars: number;
    xp: number;
    label: string;
    sessionKey: string;
    status?: LearningStatus;
    cueId?: string;
    practice?: boolean;
    extra?: boolean;
};
export type CueGamePurchase = {
    id: string;
    itemId: string;
    at: string;
    stars: number;
    xp: number;
};
export type CueGameAccount = {
    earnings: CueGameEarning[];
    purchases: CueGamePurchase[];
    equipment: Partial<Record<CueShopCategory, string>>;
};
export const emptyCueGameAccount = (): CueGameAccount => ({ earnings: [], purchases: [], equipment: {} });
/** Append-only earnings: importing old evidence, recoloring, shuffle and duplicate sync cannot erase or farm credits. */
export function reconcileCueGameAccount(value: CueGameAccount | undefined, reviews: CueReview[], now = new Date()): CueGameAccount {
    const account = value ?? emptyCueGameAccount();
    const ids = new Set(account.earnings.map(entry => entry.id));
    const earnings = [...account.earnings];
    const events: CueGameEarning[] = [];
    for (const review of reviews) {
        if (!review.cueId || !Number.isFinite(Date.parse(review.reviewedAt)) || Date.parse(review.reviewedAt) > now.getTime())
            continue;
        const key = JSON.stringify([review.cueId, review.reviewedAt, review.taskKey ?? 'legacy']);
        if (!review.practiceOnly)
            events.push({ id: `review:${key}`, at: review.reviewedAt, stars: 1, xp: 0, label: '认真检索', sessionKey: review.taskKey ?? 'legacy', status: review.status, cueId: review.cueId });
        for (const attempt of review.practiceAttempts ?? [])
            if (Number.isFinite(Date.parse(attempt.reviewedAt)) && Date.parse(attempt.reviewedAt) <= now.getTime())
                events.push({ id: `retry:${key}:${attempt.reviewedAt}`, at: attempt.reviewedAt, stars: 1, xp: 0, label: '间隔重练', sessionKey: review.taskKey ?? 'legacy', status: attempt.status, cueId: review.cueId, practice: true });
    }
    const rewardedDays = new Set(account.earnings.filter(entry => !entry.extra && entry.cueId && entry.xp > 0).map(entry => JSON.stringify([entry.cueId, dateKey(new Date(entry.at))])));
    for (const event of events.toSorted((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))) {
        if (ids.has(event.id))
            continue;
        const day = JSON.stringify([event.cueId, dateKey(new Date(event.at))]);
        event.xp = rewardedDays.has(day) ? 0 : 10;
        rewardedDays.add(day);
        ids.add(event.id);
        earnings.push(event);
    }
    const sessions = new Map<string, {
        count: number;
        streak: number;
    }>();
    const weak = new Map<string, boolean>();
    for (const event of earnings.filter(entry => !entry.extra).toSorted((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))) {
        const day = dateKey(new Date(event.at));
        const key = JSON.stringify([event.sessionKey, day]);
        const run = sessions.get(key) ?? { count: 0, streak: 0 };
        run.count++;
        run.streak = event.status === 'stable' ? run.streak + 1 : 0;
        sessions.set(key, run);
        const awards: {
            kind: string;
            amount: number;
            label: string;
        }[] = [];
        if (run.count % 10 === 0)
            awards.push({ kind: 'flow', amount: 2, label: `认真检索 ${run.count} 次` });
        if (run.streak > 0 && run.streak % 5 === 0)
            awards.push({ kind: 'streak', amount: run.streak % 20 === 0 ? 8 : 3, label: `连续 ${run.streak} 次通过` });
        const weakKey = event.cueId ?? event.id;
        if (event.practice && event.status === 'stable' && weak.get(weakKey))
            awards.push({ kind: 'repair', amount: 2, label: '薄弱项重练通过' });
        weak.set(weakKey, event.status !== 'stable');
        for (const award of awards) {
            const id = `extra:${award.kind}:${event.id}`;
            if (ids.has(id))
                continue;
            ids.add(id);
            earnings.push({ id, at: event.at, stars: award.amount, xp: 0, label: award.label, sessionKey: event.sessionKey, extra: true });
        }
    }
    return earnings.length === account.earnings.length && value ? value : { ...account, earnings };
}
export function cueShopBalance(account: CueGameAccount) {
    const earnedStars = account.earnings.reduce((sum, entry) => sum + entry.stars, 0), earnedXP = account.earnings.reduce((sum, entry) => sum + entry.xp, 0);
    return { stars: earnedStars - account.purchases.reduce((sum, entry) => sum + entry.stars, 0), xp: earnedXP - account.purchases.reduce((sum, entry) => sum + entry.xp, 0), earnedStars, earnedXP, level: Math.floor(earnedXP / 100) + 1 };
}
export function purchaseCueShopItem(account: CueGameAccount, itemId: string, now = new Date()): {
    account: CueGameAccount;
    error?: string;
} {
    const item = CUE_SHOP_ITEMS.find(item => item.id === itemId);
    if (!item)
        return { account, error: '商品不存在' };
    if (account.purchases.some(purchase => purchase.itemId === itemId))
        return { account, error: '已经拥有此商品' };
    const balance = cueShopBalance(account);
    if (balance.level < item.level)
        return { account, error: `需要 Lv.${item.level}` };
    if (balance.stars < item.stars || balance.xp < item.xp)
        return { account, error: '余额不足' };
    return { account: { ...account, purchases: [...account.purchases, { id: `purchase:${item.id}`, itemId: item.id, at: now.toISOString(), stars: item.stars, xp: item.xp }] } };
}
export function equipCueShopItem(account: CueGameAccount, itemId: string) {
    const item = CUE_SHOP_ITEMS.find(item => item.id === itemId);
    return !item || !account.purchases.some(purchase => purchase.itemId === itemId) ? account : { ...account, equipment: { ...account.equipment, [item.category]: item.id } };
}
export function cueEquippedValue(account: CueGameAccount, category: CueShopCategory) { return CUE_SHOP_ITEMS.find(item => item.id === account.equipment[category] && account.purchases.some(purchase => purchase.itemId === item.id))?.value; }
export type CueShopAction = {
    kind: 'purchase';
    itemId: string;
} | {
    kind: 'equip';
    itemId: string;
} | {
    kind: 'reset';
    category: CueShopCategory;
};
