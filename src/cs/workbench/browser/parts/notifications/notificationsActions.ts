import {
  ActionRunner,
  type IAction,
} from "src/cs/base/common/actions";

export const getNotificationActions = (
  actions: readonly IAction[] | undefined,
): readonly IAction[] => actions?.filter(action => action.enabled) ?? [];

export class NotificationActionRunner extends ActionRunner {}

export const runNotificationAction = async (
  action: IAction,
  context?: unknown,
): Promise<void> => {
  const runner = new NotificationActionRunner();
  try {
    await runner.run(action, context);
  } finally {
    runner.dispose();
  }
};
