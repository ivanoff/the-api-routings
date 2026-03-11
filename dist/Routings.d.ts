import type { CrudPermissionMeta, CrudBuilderOptionsType, MiddlewareHandler, RoutesErrorsType, RoutesEmailTemplatesType, RoutesType, RoutingsOptionsType } from './types';
export declare class Routings {
    routes: RoutesType[];
    routesPermissions: Record<string, string[]>;
    routesErrors: RoutesErrorsType;
    routesEmailTemplates: RoutesEmailTemplatesType;
    crudPermissionsMeta: CrudPermissionMeta[];
    migrationDirs: string[] | undefined;
    constructor(options?: RoutingsOptionsType);
    private pushToRoutes;
    get(path: string, ...fnArr: MiddlewareHandler[]): void;
    post(path: string, ...fnArr: MiddlewareHandler[]): void;
    patch(path: string, ...fnArr: MiddlewareHandler[]): void;
    delete(path: string, ...fnArr: MiddlewareHandler[]): void;
    use(path: string, ...fnArr: MiddlewareHandler[]): void;
    all(...fnArr: MiddlewareHandler[]): void;
    crud(params: CrudBuilderOptionsType): void;
    errors(err: RoutesErrorsType | RoutesErrorsType[]): void;
    emailTemplates(template: RoutesEmailTemplatesType): void;
}
//# sourceMappingURL=Routings.d.ts.map