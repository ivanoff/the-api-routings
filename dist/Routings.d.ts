import type { CrudPermissionMeta, CrudBuilderOptionsType, MiddlewareHandler, RoutesErrorsType, RoutesEmailTemplatesType, RoutesType, RoutingsOptionsType } from './types';
export declare class Routings {
    routes: RoutesType[];
    routesPermissions: Record<string, string[]>;
    routesErrors: RoutesErrorsType;
    routesEmailTemplates: RoutesEmailTemplatesType;
    crudPermissionsMeta: CrudPermissionMeta[];
    migrationDirs: string[] | undefined;
    private pathPrefix;
    constructor(options?: RoutingsOptionsType);
    private normalizePath;
    private normalizePrefix;
    private resolvePath;
    private pushToRoutes;
    prefix(path: string): Routings;
    get(path: string, ...fnArr: MiddlewareHandler[]): Routings;
    post(path: string, ...fnArr: MiddlewareHandler[]): Routings;
    patch(path: string, ...fnArr: MiddlewareHandler[]): Routings;
    delete(path: string, ...fnArr: MiddlewareHandler[]): Routings;
    use(path: string, ...fnArr: MiddlewareHandler[]): Routings;
    all(...fnArr: MiddlewareHandler[]): Routings;
    crud(params: CrudBuilderOptionsType): void;
    errors(err: RoutesErrorsType | RoutesErrorsType[]): void;
    emailTemplates(template: RoutesEmailTemplatesType): void;
}
//# sourceMappingURL=Routings.d.ts.map