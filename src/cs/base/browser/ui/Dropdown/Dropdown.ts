import { useEffect, useRef, type MutableRefObject, type ReactNode, type Ref, type RefCallback, type RefObject, } from "react";
type DropdownRenderProps = {
    isOpen: boolean;
    open: () => void;
    close: () => void;
    toggle: () => void;
    anchorRef: RefObject<HTMLElement | null>;
    setAnchorRef: RefCallback<HTMLElement | null>;
    contentRef: RefObject<HTMLDivElement | null>;
    setContentRef: RefCallback<HTMLDivElement | null>;
};
type DropdownProps = {
    isOpen: boolean;
    onOpenChange: (nextOpen: boolean) => void;
    anchorRef?: RefObject<HTMLElement | null>;
    closeOnClickOutside?: boolean;
    closeOnEscape?: boolean;
    children: ReactNode | ((props: DropdownRenderProps) => ReactNode);
};
const assignRef = <T,>(ref: Ref<T> | undefined, value: T) => {
    if (!ref)
        return;
    if (typeof ref === "function") {
        ref(value);
        return;
    }
    (ref as MutableRefObject<T>).current = value;
};
const Dropdown = ({ isOpen, onOpenChange, anchorRef, closeOnClickOutside = true, closeOnEscape = true, children, }: DropdownProps) => {
    const internalAnchorRef = useRef<HTMLElement | null>(null);
    const internalContentRef = useRef<HTMLDivElement | null>(null);
    const resolvedAnchorRef = anchorRef ?? internalAnchorRef;
    const open = () => onOpenChange(true);
    const close = () => onOpenChange(false);
    const toggle = () => onOpenChange(!isOpen);
    const setAnchorRef: RefCallback<HTMLElement | null> = (node) => {
        assignRef(internalAnchorRef, node);
        if (anchorRef)
            assignRef(anchorRef, node);
    };
    const setContentRef: RefCallback<HTMLDivElement | null> = (node) => {
        assignRef(internalContentRef, node);
    };
    useEffect(() => {
        if (!isOpen || !closeOnEscape)
            return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape")
                close();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [closeOnEscape, isOpen]);
    useEffect(() => {
        if (!isOpen || !closeOnClickOutside)
            return;
        const handleClickOutside = (event: MouseEvent) => {
            const anchorEl = resolvedAnchorRef.current;
            const target = event.target;
            if (!(target instanceof Node))
                return;
            if (anchorEl?.contains(target))
                return;
            const popupEl = internalContentRef.current;
            if (popupEl?.contains(target))
                return;
            close();
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [closeOnClickOutside, isOpen, resolvedAnchorRef]);
    const renderProps: DropdownRenderProps = {
        isOpen,
        open,
        close,
        toggle,
        anchorRef: resolvedAnchorRef,
        setAnchorRef,
        contentRef: internalContentRef,
        setContentRef,
    };
    return typeof children === "function" ? children(renderProps) : children;
};
export default Dropdown;
