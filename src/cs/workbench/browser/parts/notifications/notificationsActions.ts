import {
  ActionRunner,
  type IAction,
} from "src/cs/base/common/actions";

export class NotificationActionRunner extends ActionRunner {}

export const getPrimaryNotificationAction = (
  actions: readonly IAction[] | undefined,
): IAction | undefined => actions?.find(action => action.enabled);

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
