import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { normalizeCtaName, normalizeCtaToken } from '../../utils/cta';

const cx = (...parts) => parts.filter(Boolean).join(' ');

const MODAL_OVERLAY_CLASS = 'modal-overlay';
const MODAL_BACKDROP_CLASS = 'modal-backdrop';
const MODAL_DIALOG_BASE_CLASS = 'modal';

const MODAL_DIALOG_VARIANTS = {
    default: 'modal--primary',
    primary: 'modal--primary',
    glass: 'modal--primary',
    solid: 'modal--solid',
    flat: 'modal--flat',
};

const MODAL_DIALOG_SIZES = {
    sm: 'modal--sm',
    md: 'modal--md',
    lg: 'modal--lg',
    xl: 'modal--xl',
};

const Modal = ({
    isOpen,
    onClose,
    idBase,
    title,
    headerRight,
    children,
    footer,
    variant = 'primary',
    size = 'md',
    initialFocus = 'dialog', // 'dialog' | 'first'
    className = '',
    dataUi,
    cta,
    ctaPosition,
    ctaCopy,
}) => {
    const reactId = useId();
    const stableIdBase = normalizeCtaToken(idBase);
    const titleId = stableIdBase ? `${stableIdBase}-title` : `modal-title-${reactId}`;
    const uiMarker = typeof dataUi === 'string' && dataUi.trim() ? dataUi.trim() : undefined;

    const dialogRef = useRef(null);
    const previouslyFocusedRef = useRef(null);
    const previousBodyOverflowRef = useRef(null);

    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') onClose();
        };

        let focusHandle = null;

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            previouslyFocusedRef.current =
                document.activeElement instanceof HTMLElement ? document.activeElement : null;
            previousBodyOverflowRef.current = document.body.style.overflow;
            document.body.style.overflow = 'hidden';

            focusHandle = requestAnimationFrame(() => {
                const dialog = dialogRef.current;
                if (!dialog) return;

                const autoFocusTarget = dialog.querySelector(
                    '[data-autofocus], [autofocus]',
                );

                const focusable =
                    initialFocus === 'first'
                        ? dialog.querySelector(
                            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
                        )
                        : null;

                const target =
                    (autoFocusTarget instanceof HTMLElement && autoFocusTarget) ||
                    (focusable instanceof HTMLElement && focusable) ||
                    dialog;
                if (typeof target.focus === 'function') target.focus();
            });
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            if (focusHandle != null) {
                cancelAnimationFrame(focusHandle);
            }

            if (!isOpen) return;

            document.body.style.overflow = previousBodyOverflowRef.current ?? '';

            const prev = previouslyFocusedRef.current;
            if (prev && typeof prev.focus === 'function') {
                try {
                    prev.focus();
                } catch {
                    // Ignore focus restore errors (element may be gone)
                }
            }
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const hasHeader = title != null || headerRight != null;
    const dialogClassName = cx(
        MODAL_DIALOG_BASE_CLASS,
        MODAL_DIALOG_VARIANTS[variant] || MODAL_DIALOG_VARIANTS.default,
        MODAL_DIALOG_SIZES[size] || MODAL_DIALOG_SIZES.md,
        className,
    );

    return createPortal(
        <div
            className={MODAL_OVERLAY_CLASS}
            data-style="modal"
            data-ui={uiMarker}
        >
            {/* Backdrop */}
            <div
                className={MODAL_BACKDROP_CLASS}
                onClick={onClose}
                data-ui={uiMarker ? `${uiMarker}-backdrop` : undefined}
            />

            {/* Modal Content */}
            <div
                className={dialogClassName}
                id={stableIdBase ? `${stableIdBase}-dialog` : undefined}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title != null ? titleId : undefined}
                tabIndex={-1}
                ref={dialogRef}
                data-ui={uiMarker ? `${uiMarker}-dialog` : undefined}
                data-cta={normalizeCtaName(cta)}
                data-cta-position={normalizeCtaToken(ctaPosition)}
                data-cta-copy={normalizeCtaToken(ctaCopy)}
            >
                {/* Header */}
                {hasHeader && (
                    <div
                        className={cx(
                            'modal_header',
                            headerRight ? 'justify-between gap-4' : undefined,
                        )}
                    >
                        {title != null && (
                            <h3
                                id={titleId}
                                className="modal_title"
                            >
                                {title}
                            </h3>
                        )}
                        {headerRight != null && (
                            <div className="modal_headerRight">
                                {headerRight}
                            </div>
                        )}
                    </div>
                )}

                {/* Body */}
                <div className="modal_body">
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className="modal_footer">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

export default Modal;
