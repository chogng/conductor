import { useRef, useEffect } from 'react';

/**
 * 通用弹出层组件
 * @param {boolean} isOpen - 是否打开
 * @param {function} onClose - 关闭回调
 * @param {string} align - 对齐方式: 'left' | 'center' | 'right'
 * @param {number} zIndex - 层级
 * @param {string} className - 额外样式
 * @param {React.ReactNode} children - 弹出内容
 * @param {string} triggerId - 触发器ID (用于 aria-labelledby)
 * @param {string} menuId - 菜单ID
 * @param {boolean} closeOnClickOutside - 点击外部是否关闭
 * @param {React.RefObject} containerRef - 容器引用 (用于点击外部检测)
 */
const Popup = ({
    isOpen,
    onClose,
    align = 'left',
    zIndex = 20,
    className = '',
    children,
    triggerId,
    menuId,
    closeOnClickOutside = true,
    containerRef,
}) => {
    const popupRef = useRef(null);

    // 点击外部关闭
    useEffect(() => {
        if (!isOpen || !closeOnClickOutside) return;

        const handleClickOutside = (e) => {
            const ref = containerRef?.current || popupRef.current;
            if (ref && !ref.contains(e.target)) {
                onClose?.();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, closeOnClickOutside, onClose, containerRef]);

    const resolvedChildren = typeof children === 'function' ? (isOpen ? children() : null) : children;

    return (
        <div
            ref={popupRef}
            className={`
                absolute top-full pt-[0.5rem]
                ${align === 'right' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0'}
                ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}
            `}
            style={{ zIndex }}
        >
            <div
                id={menuId}
                role="menu"
                aria-orientation="vertical"
                aria-labelledby={triggerId}
                aria-hidden={isOpen ? undefined : true}
                data-style="popup"
                data-state={isOpen ? 'open' : 'closed'}
                data-side="bottom"
                data-align={align}
                tabIndex={-1}
                className={`
                    rounded-[1rem] shadow-premium py-[0.5rem] pl-[0.5rem] pr-[0.125rem]
                    bg-bg-surface/70 backdrop-blur-md
                    transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]
                    ${align === 'right' ? 'origin-top-right' : align === 'center' ? 'origin-top' : 'origin-top-left'}
                    ${isOpen ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-[10px] scale-95'}
                    ${className}
                `}
            >
                {resolvedChildren}
            </div>
        </div>
    );
};

export default Popup;
